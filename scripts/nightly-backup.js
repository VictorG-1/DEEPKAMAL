/**
 * Nightly SQLite backup. Schedule with Windows Task Scheduler:
 *   schtasks /Create /SC DAILY /TN "DeepKamalBackup" /TR "node C:\\Users\\DELL\\Documents\\ChatGPT\\DEEPKAMAL\\scripts\\nightly-backup.js" /ST 02:00
 * Or: npm run backup:nightly
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dbPath = path.join(root, 'data', 'deepkamal.db');
const backupDir = path.join(root, 'data', 'backups');
const logPath = path.join(backupDir, 'backup.log');

if (!fs.existsSync(dbPath)) {
  console.error('No database at', dbPath);
  process.exit(1);
}
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(backupDir, `deepkamal-nightly-${stamp}.db`);
fs.copyFileSync(dbPath, dest);

const files = fs
  .readdirSync(backupDir)
  .filter((f) => f.endsWith('.db'))
  .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const old of files.slice(30)) {
  fs.unlinkSync(path.join(backupDir, old.f));
}

const line = `${new Date().toISOString()} OK ${dest} (${fs.statSync(dest).size} bytes)\n`;
fs.appendFileSync(logPath, line);
console.log(line.trim());

// Optional: if SUPABASE_URL set, note that live sync is still SQLite-primary
try {
  const { status } = require('../server/lib/supabase');
  const sb = status();
  if (sb.enabled) {
    fs.appendFileSync(logPath, `${new Date().toISOString()} supabase configured (${sb.mode}) — use npm run db:export-supabase for dump\n`);
  }
} catch (_) {
  /* ignore */
}
