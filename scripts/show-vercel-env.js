/**
 * Prints Vercel env values from local .env (does not commit secrets).
 * Usage: node scripts/show-vercel-env.js
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env');
  process.exit(1);
}

const wanted = ['DATABASE_URL', 'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const map = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  map[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

console.log('\n=== Copy into Vercel Environment Variables ===\n');
for (const key of wanted) {
  const val = map[key];
  if (!val) {
    console.log(`${key}\n  MISSING in .env\n`);
    continue;
  }
  console.log(`${key}`);
  console.log(val);
  console.log('');
}
console.log('Then: Vercel → Deployments → Redeploy (or push a commit).\n');
console.log('Check: https://YOUR-APP.vercel.app/api/health\n');
