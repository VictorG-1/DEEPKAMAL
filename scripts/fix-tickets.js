const db = require('../server/db');

const tables = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE 'ticket%'`).all();
console.log('Tables:', tables.map((t) => t.name));
tables.forEach((t) => console.log('\n---', t.name, '---\n', t.sql));

try {
  console.log('Count tickets:', db.prepare('SELECT COUNT(*) AS c FROM tickets').get());
} catch (e) {
  console.log('tickets query failed:', e.message);
}

const hasOld = tables.some((t) => t.name === 'tickets_old');
const hasNew = tables.some((t) => t.name === 'tickets');

if (hasOld && !hasNew) {
  console.log('Recovering: rename tickets_old -> tickets');
  db.exec(`ALTER TABLE tickets_old RENAME TO tickets`);
}

if (hasOld && hasNew) {
  console.log('Both exist — merging any leftover rows then dropping old');
  try {
    db.exec(`INSERT OR IGNORE INTO tickets SELECT * FROM tickets_old`);
  } catch (e) {
    console.log('merge skip:', e.message);
  }
  db.exec(`DROP TABLE tickets_old`);
}

// Ensure status column allows new values by rebuilding if needed
const sql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'`).get()?.sql || '';
if (sql && !sql.includes("'Assigned'")) {
  console.log('Rebuilding tickets with expanded statuses…');
  db.exec(`
    CREATE TABLE tickets_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      client_id INTEGER REFERENCES clients(id),
      site_id INTEGER REFERENCES sites(id),
      assigned_user_id INTEGER REFERENCES users(id),
      priority TEXT DEFAULT 'Normal',
      status TEXT DEFAULT 'Unassigned',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO tickets_new SELECT * FROM tickets;
    DROP TABLE tickets;
    ALTER TABLE tickets_new RENAME TO tickets;
  `);
}

console.log('OK tickets=', db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c);
console.log('Sample:', db.prepare('SELECT id, code, status FROM tickets ORDER BY id DESC LIMIT 5').all());
