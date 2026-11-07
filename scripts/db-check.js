const path = require('path');
const fs = require('fs');
const db = require('../server/db');

db.pragma('wal_checkpoint(TRUNCATE)');

const dbPath = db.dbPath;
const stat = fs.statSync(dbPath);

const counts = {
  users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
  services: db.prepare('SELECT COUNT(*) AS c FROM services').get().c,
  tickets: db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c,
  orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
  clients: db.prepare('SELECT COUNT(*) AS c FROM clients').get().c,
  attendance: db.prepare('SELECT COUNT(*) AS c FROM attendance').get().c,
  categories: db.prepare('SELECT COUNT(*) AS c FROM service_categories').get().c
};

console.log(JSON.stringify({ ok: true, dbPath, sizeBytes: stat.size, counts }, null, 2));
