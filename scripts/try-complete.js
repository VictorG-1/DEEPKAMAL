const db = require('../server/db');

console.log(
  'master',
  db.prepare(`SELECT type, name, tbl_name FROM sqlite_master WHERE name LIKE '%ticket%'`).all()
);

const ticket = db.prepare(`SELECT * FROM tickets WHERE status = 'In progress' LIMIT 1`).get();
console.log('ticket', ticket);

try {
  const evidence = db
    .prepare(
      `INSERT INTO work_evidence (ticket_id, user_id, captured_at, latitude, longitude, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(ticket.id, ticket.assigned_user_id, new Date().toISOString(), 28.45, 77.02, 'test complete');
  console.log('evidence', evidence.lastInsertRowid);
  db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  console.log('updated', db.prepare('SELECT status FROM tickets WHERE id = ?').get(ticket.id));
} catch (e) {
  console.error('FAIL', e);
}
