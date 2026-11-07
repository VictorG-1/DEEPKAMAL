const db = require('../server/db');

db.pragma('foreign_keys = OFF');

// Rebuild work_evidence without stale FK to tickets_old
db.exec(`
  CREATE TABLE IF NOT EXISTS work_evidence_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_work_id INTEGER,
    ticket_id INTEGER,
    user_id INTEGER,
    captured_at TEXT,
    latitude REAL,
    longitude REAL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const has = db.prepare(`SELECT name FROM sqlite_master WHERE name='work_evidence'`).get();
if (has) {
  try {
    db.exec(`INSERT INTO work_evidence_new SELECT * FROM work_evidence`);
  } catch (e) {
    console.log('copy evidence:', e.message);
  }
  db.exec(`DROP TABLE work_evidence`);
}
db.exec(`ALTER TABLE work_evidence_new RENAME TO work_evidence`);

// Ensure tickets has no CHECK issues / rebuild without FK rename ghosts
db.exec(`
  CREATE TABLE tickets_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    client_id INTEGER,
    site_id INTEGER,
    assigned_user_id INTEGER,
    priority TEXT DEFAULT 'Normal',
    status TEXT DEFAULT 'Unassigned',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO tickets_new SELECT * FROM tickets;
  DROP TABLE tickets;
  ALTER TABLE tickets_new RENAME TO tickets;
`);

db.pragma('foreign_keys = ON');

const ticket = db.prepare(`SELECT * FROM tickets ORDER BY id DESC LIMIT 1`).get();
console.log('ticket', ticket);

const evidence = db
  .prepare(
    `INSERT INTO work_evidence (ticket_id, user_id, captured_at, latitude, longitude, notes)
     VALUES (?, ?, datetime('now'), ?, ?, ?)`
  )
  .run(ticket.id, ticket.assigned_user_id || 1, 28.45, 77.02, 'fk fix complete test');

db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
console.log('OK evidence', evidence.lastInsertRowid, 'status', db.prepare('SELECT status FROM tickets WHERE id=?').get(ticket.id).status);
