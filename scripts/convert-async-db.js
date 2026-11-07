#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'server');

function listJsFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsFiles(p));
    else if (ent.name.endsWith('.js') && ent.name !== 'db.js') out.push(p);
  }
  return out;
}

function parenBalance(s) {
  let n = 0;
  let inStr = null;
  let esc = false;
  for (const c of s) {
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '(') n++;
    else if (c === ')') n--;
  }
  return n;
}

function isDbStatement(text) {
  return (
    /\bdb\.prepare\b/.test(text) ||
    /\bdb\.transaction\b/.test(text) ||
    /\bdb\.exec\b/.test(text) ||
    /^\s*\w+\s*\.\s*(run|get|all)\s*\(/.test(text.trim())
  );
}

function startsDbChain(line) {
  return (
    /\bdb\.prepare/.test(line) ||
    /=\s*db\s*$/.test(line) ||
    /^\s*db\s*$/.test(line.trim()) ||
    /^\s*db\.transaction/.test(line)
  );
}

function continuesChain(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^\./.test(t)) return true;
  if (/\bdb\b/.test(t)) return true;
  return false;
}

function transformStatement(stmt) {
  if (!isDbStatement(stmt)) return stmt;

  let s = stmt;

  s = s.replace(
    /const\s+(\w+)\s*=\s*db\.transaction\(\s*(\([^)]*\)|\(\))\s*=>\s*\{([\s\S]*)\}\s*\)\s*;\s*\1\s*\(([^)]*)\)\s*;/,
    'await db.transaction(async $2 => {$3});'
  );
  s = s.replace(
    /const\s+tx\s*=\s*db\.transaction\(\s*(\([^)]*\)|\(\))\s*=>\s*\{([\s\S]*)\}\s*\)\s*;\s*tx\s*\(\s*\)\s*;/,
    'await db.transaction(async $1 => {$2});'
  );
  s = s.replace(/\bdb\.transaction\(\s*(\([^)]*\)|\(\))\s*=>\s*\{/, 'await db.transaction(async $1 => {');
  s = s.replace(/(?<!\bawait\s)db\.exec\(/g, 'await db.exec(');

  s = s.replace(/(\s+)upsert\.run\(/g, '$1await upsert.run(');
  s = s.replace(/(\s+)insertCat\.run\(/g, '$1await insertCat.run(');
  s = s.replace(/(\s+)insertSvc\.run\(/g, '$1await insertSvc.run(');
  s = s.replace(/(\s+)fix\.run\(/g, '$1await fix.run(');
  s = s.replace(/(\s+)ins\.run\(/g, '$1await ins.run(');
  s = s.replace(/(\s+)insertItem\.run\(/g, '$1await insertItem.run(');
  s = s.replace(/(\s+)insertQuote\.run\(/g, '$1await insertQuote.run(');

  const m = s.match(/^(\s*)(const|let|var)\s+(\w+)\s*=\s*([\s\S]+)$/);
  if (m && /\.(get|all|run)\s*\(/.test(m[4])) {
    let expr = m[4].trimEnd();
    if (!/^await\s/.test(expr)) {
      if (/\.(get|all)\([\s\S]*?\)\s*\.[a-zA-Z_]/.test(expr)) {
        expr = expr.replace(/^([\s\S]+?\.(get|all)\([\s\S]*?\))(\s*\.[a-zA-Z_]\w*)/, '(await $1)$3');
      } else if (/\.run\([\s\S]*?\)\s*\.lastInsertRowid/.test(expr)) {
        expr = expr.replace(/^([\s\S]+?\.run\([\s\S]*?\))(\s*\.lastInsertRowid)/, '(await $1)$2');
      } else {
        expr = 'await ' + expr;
      }
      return m[1] + m[2] + ' ' + m[3] + ' = ' + expr;
    }
    return s;
  }

  if (/^\s*if\s*\(\s*db\.prepare/.test(s)) {
    return s.replace(
      /if\s*\(\s*(db\.prepare[\s\S]+?\.(get|all)\([\s\S]*?\))(\s*[\.\)>!=])/,
      (all, dbExpr, _method, tail) => `if ((await ${dbExpr})${tail}`
    );
  }

  if (/^\s*return\s+db\.prepare/.test(s.trim())) {
    return s.replace(/^(\s*)return\s+/, '$1return await ');
  }

  if (/^\s*await\s+db\.prepare/.test(s) || /^\s*db\.prepare/.test(s.trim())) {
    if (!/\bawait\b/.test(s)) return s.replace(/^(\s*)(db\.)/, '$1await $2');
  }
  if (/^\s+db\.prepare/.test(s) && !/\bawait\b/.test(s)) {
    return s.replace(/^(\s+)(db\.)/, '$1await $2');
  }
  if (/^\s+await\s+db\.prepare/.test(s)) return s;

  if (/^\s*db\.prepare/.test(s.trim()) && !/\bawait\b/.test(s)) {
    return s.replace(/^(\s*)(db\.)/, '$1await $2');
  }

  return s;
}

function convertSource(src) {
  const lines = src.split('\n');
  const out = [];
  let buf = [];

  const flush = () => {
    if (!buf.length) return;
    out.push(transformStatement(buf.join('\n')));
    buf = [];
  };

  for (const line of lines) {
    if (!buf.length) {
      if (startsDbChain(line)) {
        buf.push(line);
        if (line.trim().endsWith(';') && parenBalance(buf.join('\n')) === 0) flush();
        continue;
      }
      if (/\bdb\.prepare.*\.(get|all|run)\(/.test(line) && line.trim().endsWith(';')) {
        out.push(transformStatement(line));
        continue;
      }
      out.push(line);
      continue;
    }
    buf.push(line);
    const joined = buf.join('\n');
    if (line.trim().endsWith(';') && parenBalance(joined) === 0) flush();
    else if (!continuesChain(line) && parenBalance(joined) === 0) flush();
  }
  flush();

  let result = out.join('\n');
  result = result.replace(/\bfunction\s+(\w+)\s*\(/g, (m, name, o) => {
    if (/\basync\s*$/.test(result.slice(Math.max(0, o - 8), o))) return m;
    const b = result.indexOf('{', o + m.length);
    if (b < 0) return m;
    let d = 1;
    let i = b + 1;
    while (i < result.length && d) {
      if (result[i] === '{') d++;
      else if (result[i] === '}') d--;
      i++;
    }
    return /\bawait\b/.test(result.slice(b + 1, i - 1)) ? m.replace('function', 'async function') : m;
  });
  result = result.replace(/\bawait await /g, 'await ');
  return result;
}

function patchSeed(src) {
  src = src.replace(/\nseed\(\);\s*$/, '\n');
  for (const fn of [
    'upsertUser',
    'ensurePartnerPins',
    'seedLogins',
    'seedStaff',
    'seedCatalog',
    'seedMaterials',
    'seedInventory',
    'seedBanks',
    'seedVendorsAndAssets',
    'seedCustomerClient',
    'seed'
  ]) {
    src = src.replace(new RegExp(`\\bfunction ${fn}\\(`, 'g'), `async function ${fn}(`);
  }
  for (const c of [
    'seedLogins',
    'seedStaff',
    'seedCatalog',
    'seedMaterials',
    'seedInventory',
    'seedBanks',
    'seedCustomerClient',
    'seedVendorsAndAssets',
    'ensurePartnerPins'
  ]) {
    src = src.replace(new RegExp(`(?<!await )\\b${c}\\(`, 'g'), `await ${c}(`);
  }
  src = src.replace(/(?<!await )upsertUser\(/g, 'await upsertUser(');
  src = src.replace(/(?<!await )seedInitialStock\(/g, 'await seedInitialStock(');
  src = src.replace(/\basync async function\b/g, 'async function');
  src = src.replace(/\bawait await /g, 'await ');
  if (!src.includes('module.exports = { ready')) {
    src += `
const ready = seed().catch((e) => {
  console.error('Seed failed:', e);
  throw e;
});
module.exports = { ready, seed };
`;
  }
  return src;
}

function postProcessRoutes(src) {
  src = src.replace(/router\.(get|post|put|patch|delete)async/g, 'router.$1');
  src = src.replace(/, \((req, res)\) =>/g, ', async ($1) =>');
  src = src.replace(/, \((_req, res)\) =>/g, ', async ($1) =>');
  return src;
}

function convertFile(fp) {
  let src = fs.readFileSync(fp, 'utf8');
  src = convertSource(src);
  if (path.basename(fp) === 'seed.js') src = patchSeed(src);
  if (fp.includes(`${path.sep}routes${path.sep}`)) src = postProcessRoutes(src);
  fs.writeFileSync(fp, src);
}

function patchApp() {
  const p = path.join(SERVER, 'app.js');
  if (!fs.existsSync(p)) return;
  let src = fs.readFileSync(p, 'utf8');
  if (!src.includes('seedReady')) {
    src = src.replace(/require\('\.\/seed'\);?/, "const { ready: seedReady } = require('./seed');\n");
    src = src.replace(
      /app\.use\(cors\(\)\);/,
      "app.use(cors());\napp.use(async (req, res, next) => { try { await seedReady; next(); } catch (e) { next(e); } });\n"
    );
  }
  fs.writeFileSync(p, src);
  convertFile(p);
  let a = fs.readFileSync(p, 'utf8');
  a = a.replace(
    "app.get('/api/health', (_req, res) =>",
    "app.get('/api/health', async (_req, res) =>"
  );
  fs.writeFileSync(p, a);
}

for (const f of listJsFiles(SERVER)) {
  if (path.basename(f) !== 'app.js' && !f.endsWith('lib\\inventory.js') && !f.endsWith('lib/inventory.js'))
    convertFile(f);
}
// inventory manual
patchApp();
