const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const root = path.join(__dirname, '..');
const backupDir = path.join(root, 'data', 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(backupDir, `deepkamal-${stamp}.db`);

db.pragma('wal_checkpoint(TRUNCATE)');
fs.copyFileSync(db.dbPath, dest);

const files = fs
  .readdirSync(backupDir)
  .filter((f) => f.endsWith('.db'))
  .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
// keep last 14
for (const old of files.slice(14)) {
  fs.unlinkSync(path.join(backupDir, old.f));
}

console.log(`Backup written: ${dest}`);
console.log(`Backups kept: ${Math.min(files.length, 14)}`);
