/**
 * Export SQLite tables to JSON for import into Supabase/Postgres.
 * Does not push live — review files in data/export/ then load with Supabase SQL / Table Editor.
 *
 *   npm run db:export-supabase
 */
const fs = require('fs');
const path = require('path');
const db = require('../server/db');
const { status } = require('../server/lib/supabase');

const outDir = path.join(__dirname, '..', 'data', 'export');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const tables = [
  'users',
  'clients',
  'sites',
  'tickets',
  'ticket_messages',
  'attendance',
  'quotations',
  'quotation_items',
  'invoices',
  'invoice_items',
  'site_assets',
  'asset_service_log',
  'materials',
  'inventory_stock',
  'vendors',
  'purchase_orders',
  'notifications'
];

const manifest = { exportedAt: new Date().toISOString(), supabase: status(), tables: {} };

for (const table of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    // Strip password hashes from export by default
    const safe =
      table === 'users'
        ? rows.map(({ password_hash, pin_hash, ...rest }) => ({
            ...rest,
            password_hash: null,
            pin_hash: null,
            _note: 'Hashes omitted — reset passwords after import'
          }))
        : rows;
    fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(safe, null, 2));
    manifest.tables[table] = safe.length;
  } catch (err) {
    manifest.tables[table] = { error: err.message };
  }
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const sqlHints = `-- Supabase / Postgres import hints (create matching tables, then upsert from JSON)
-- 1. Create project at supabase.com and set SUPABASE_URL + SUPABASE_ANON_KEY in .env
-- 2. Keep SQLite as primary until you cut over; nightly backups continue via npm run backup:nightly
-- 3. Import JSON with a small loader or Table Editor
-- Exported: ${manifest.exportedAt}
`;
fs.writeFileSync(path.join(outDir, 'README.txt'), sqlHints);

console.log('Exported to data/export/');
console.log(JSON.stringify(manifest.tables, null, 2));
console.log('Supabase:', manifest.supabase.note);
