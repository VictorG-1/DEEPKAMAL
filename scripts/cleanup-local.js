const db = require('../server/db');
db.pragma('foreign_keys = OFF');
const r = db.prepare(`DELETE FROM users WHERE email LIKE '%@deepkamal.local'`).run();
db.pragma('foreign_keys = ON');
console.log('Removed old .local accounts:', r.changes);
console.log('Users now:', db.prepare('SELECT COUNT(*) AS c FROM users').get().c);
