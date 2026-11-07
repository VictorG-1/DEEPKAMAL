/**
 * Supabase status helper. Live data uses DATABASE_URL (Postgres) when set.
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
    if (out[m[1]] == null || out[m[1]] === '') {
      out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function status() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || null;
  const key = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;
  const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || null;
  const pg = Boolean(dbUrl);
  return {
    enabled: Boolean(url && key),
    url: url || null,
    mode: pg ? 'postgres-primary' : 'sqlite-fallback',
    databaseUrlConfigured: pg,
    note: pg
      ? 'Connected via DATABASE_URL (Supabase Postgres). Suitable for Vercel.'
      : url && key
        ? 'Supabase URL/key found but DATABASE_URL missing — using local SQLite.'
        : 'Not configured. Set DATABASE_URL for Vercel / Supabase Postgres.'
  };
}

module.exports = { status, loadEnv };
