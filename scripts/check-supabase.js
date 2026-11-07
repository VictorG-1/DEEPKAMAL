/**
 * Reports whether this project is configured for Supabase.
 * DeepKamal currently runs on local SQLite (better-sqlite3).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envFiles = ['.env', '.env.local', '.env.development'].map((f) => path.join(root, f));
const found = {};

for (const file of envFiles) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'VITE_SUPABASE_URL'
  ]) {
    const m = text.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
    if (m) found[key] = m[1].trim().replace(/^["']|["']$/g, '');
  }
}

const pkg = require(path.join(root, 'package.json'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const hasSdk = Boolean(deps['@supabase/supabase-js']);

const url = found.SUPABASE_URL || found.NEXT_PUBLIC_SUPABASE_URL || found.VITE_SUPABASE_URL;
const report = {
  engine: 'sqlite (better-sqlite3)',
  dbFile: path.join(root, 'data', 'deepkamal.db'),
  supabaseConfigured: Boolean(url && (found.SUPABASE_ANON_KEY || found.SUPABASE_SERVICE_ROLE_KEY)),
  supabaseSdkInstalled: hasSdk,
  envKeysFound: Object.keys(found),
  supabaseUrl: url || null
};

console.log(JSON.stringify(report, null, 2));

if (!report.supabaseConfigured) {
  console.log('\nSupabase: NOT configured.');
  console.log('This app uses local SQLite at data/deepkamal.db — it is working without Supabase.');
  console.log('To use Supabase later, add SUPABASE_URL + SUPABASE_ANON_KEY to .env and a migration layer.');
  process.exitCode = 0;
} else {
  console.log('\nSupabase env detected. Live ping is not run from this script (no network test by default).');
}
