/**
 * Optional Supabase bridge. App remains SQLite-primary.
 * Set SUPABASE_URL + SUPABASE_ANON_KEY in .env to enable status reporting / future sync.
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const out = { ...process.env };
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function status() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || null;
  const key = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;
  return {
    enabled: Boolean(url && key),
    url: url || null,
    mode: 'sqlite-primary',
    note: url && key
      ? 'Credentials found. Sync hooks are ready for future push; live DB is still SQLite.'
      : 'Not configured. DeepKamal uses local SQLite (data/deepkamal.db).'
  };
}

module.exports = { status, loadEnv };
