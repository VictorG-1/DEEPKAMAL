/**
 * Dual DB driver:
 * - DATABASE_URL set  → Supabase/Postgres (async pg Pool) — required for Vercel
 * - otherwise         → local SQLite via better-sqlite3 (async-wrapped for same API)
 *
 * API: prepare(sql).get/all/run → Promises; transaction(fn); exec(sql)
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] != null && process.env[m[1]] !== '') continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnvFile();

function normalizeDatabaseUrl(raw) {
  if (!raw) return '';
  // Prefer Supabase Transaction pooler (6543) for serverless — session mode (5432) caps ~15 clients
  try {
    const u = new URL(raw);
    if (
      u.hostname.includes('pooler.supabase.com') &&
      (u.port === '5432' || u.port === '')
    ) {
      u.port = '6543';
    }
    return u.toString();
  } catch (_) {
    return raw.replace(':5432/', ':6543/');
  }
}

const DATABASE_URL = normalizeDatabaseUrl(
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ''
);
const ON_VERCEL = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const USE_PG = Boolean(DATABASE_URL);

if (ON_VERCEL && !USE_PG) {
  console.error(
    'FATAL: DATABASE_URL is required on Vercel. Set it in Project → Settings → Environment Variables.'
  );
}

function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function translateSql(sql, forPg) {
  if (!forPg) return sql;
  let s = sql;

  // Case-insensitive email / text compares
  s = s.replace(/(\b[\w.]+)\s*=\s*\?\s*COLLATE\s+NOCASE/gi, 'LOWER($1) = LOWER(?)');
  s = s.replace(/\s+COLLATE\s+NOCASE/gi, '');

  // SQLite datetime/date helpers → Postgres
  s = s.replace(/datetime\('now'\)/gi, "to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')");
  s = s.replace(/strftime\('%Y-%m'\s*,\s*'now'\)/gi, "to_char(NOW(), 'YYYY-MM')");
  s = s.replace(/strftime\('%Y-%m'\s*,\s*([^)]+)\)/gi, "to_char(($1)::timestamp, 'YYYY-MM')");
  // Keep as date (not text) so comparisons like date(col) <= date('now','+45 day') type-check
  s = s.replace(/date\('now'\s*,\s*'([+-]\d+)\s*day'\)/gi, (_, n) => `(CURRENT_DATE + INTERVAL '${Number(n)} days')`);
  s = s.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  s = s.replace(/date\(\s*\?\s*,\s*'([+-]\d+)\s*day'\)/gi, (_, n) => `(CAST(? AS date) + INTERVAL '${Number(n)} days')`);
  s = s.replace(/date\(\s*([a-zA-Z_][\w.]*)\s*\)/gi, '(($1)::date)');

  // ON CONFLICT(col) is valid in both; excluded.* works in PG
  return s;
}

function makePgStatement(client, sql) {
  const translated = translateSql(sql, true);
  const isInsert = /^\s*INSERT\s+/i.test(translated);
  const hasReturning = /\bRETURNING\b/i.test(translated);
  let querySql = translated;
  if (isInsert && !hasReturning) {
    // RETURNING * — tables may key on id or material_id / token, etc.
    querySql = `${translated.replace(/;\s*$/, '')} RETURNING *`;
  }
  const pgSql = toPgParams(querySql);

  return {
    async get(...params) {
      const res = await client.query(pgSql, params);
      return res.rows[0] || undefined;
    },
    async all(...params) {
      const res = await client.query(pgSql, params);
      return res.rows;
    },
    async run(...params) {
      const res = await client.query(pgSql, params);
      const row = res.rows[0];
      let lastInsertRowid = 0;
      if (row) {
        if (row.id != null) lastInsertRowid = Number(row.id);
        else if (row.material_id != null) lastInsertRowid = Number(row.material_id);
      }
      return {
        changes: res.rowCount || 0,
        lastInsertRowid
      };
    }
  };
}

function createPgDb(pool) {
  const db = {
    driver: 'postgres',
    dbPath: DATABASE_URL.replace(/:[^:@/]+@/, ':****@'),
    prepare(sql) {
      return makePgStatement(pool, sql);
    },
    async exec(sql) {
      const translated = translateSql(sql, true);
      await pool.query(translated);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = {
          driver: 'postgres',
          prepare(sql) {
            return makePgStatement(client, sql);
          },
          async exec(sql) {
            await client.query(translateSql(sql, true));
          }
        };
        // Prefer tx inside callback; also alias prepare onto a proxy that routes to client
        const prevPrepare = db.prepare;
        const prevExec = db.exec;
        db.prepare = (sql) => makePgStatement(client, sql);
        db.exec = async (sql) => client.query(translateSql(sql, true));
        try {
          const result = await fn(tx);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          db.prepare = prevPrepare;
          db.exec = prevExec;
        }
      } finally {
        client.release();
      }
    },
    checkpoint() {},
    async close() {
      await pool.end();
    }
  };
  return db;
}

function createSqliteDb() {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    throw new Error(
      'better-sqlite3 is not installed and DATABASE_URL is not set. For Vercel set DATABASE_URL; for local run: npm i better-sqlite3'
    );
  }
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'deepkamal.db');
  const raw = new Database(dbPath);
  raw.pragma('journal_mode = DELETE');
  raw.pragma('synchronous = FULL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');

  // Schema migrate (SQLite only — Postgres uses supabase/migrations)
  require('./db-sqlite-migrate')(raw);

  function wrapStmt(stmt) {
    return {
      async get(...params) {
        return stmt.get(...params);
      },
      async all(...params) {
        return stmt.all(...params);
      },
      async run(...params) {
        const info = stmt.run(...params);
        return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
      }
    };
  }

  const db = {
    driver: 'sqlite',
    dbPath,
    prepare(sql) {
      return wrapStmt(raw.prepare(sql));
    },
    async exec(sql) {
      raw.exec(sql);
    },
    async transaction(fn) {
      raw.exec('BEGIN');
      try {
        const result = await fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch (_) {
          /* ignore */
        }
        throw err;
      }
    },
    checkpoint() {
      try {
        raw.pragma('wal_checkpoint(TRUNCATE)');
      } catch (_) {
        /* ignore */
      }
    },
    close() {
      raw.close();
    }
  };

  process.on('exit', () => db.checkpoint());
  process.on('SIGINT', () => {
    db.checkpoint();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    db.checkpoint();
    process.exit(0);
  });

  return db;
}

function createMissingConfigDb() {
  const err = () => {
    throw new Error(
      'DATABASE_URL is not set. Add it in Vercel → Settings → Environment Variables (Supabase pooler URL).'
    );
  };
  return {
    driver: 'none',
    dbPath: null,
    prepare() {
      return { get: err, all: err, run: err };
    },
    async exec() {
      err();
    },
    async transaction() {
      err();
    },
    checkpoint() {},
    close() {}
  };
}

let db;

if (USE_PG) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Serverless: one client per isolate; release quickly so pooler slots free up
    max: 1,
    min: 0,
    idleTimeoutMillis: ON_VERCEL ? 500 : 5000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true
  });
  pool.on('error', (err) => {
    console.error('Postgres pool error:', err.message || err);
  });
  db = createPgDb(pool);
  console.log('DeepKamal DB: Postgres/Supabase', ON_VERCEL ? '(vercel pool max=1)' : '');
} else if (ON_VERCEL) {
  db = createMissingConfigDb();
  console.error('DeepKamal DB: missing DATABASE_URL on Vercel');
} else {
  db = createSqliteDb();
  console.log('DeepKamal DB: SQLite', db.dbPath);
}

module.exports = db;
module.exports.dbPath = db.dbPath;
module.exports.driver = db.driver;
module.exports.checkpoint = (...a) => db.checkpoint(...a);
module.exports.USE_PG = USE_PG;
