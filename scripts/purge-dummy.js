/**
 * Removes demo accounts and all transactional / test operational data.
 * Keeps: real staff, login roles (@deepkamal.in), services catalog, materials rate card.
 */
const db = require('../server/db');

db.pragma('foreign_keys = OFF');

const result = db.transaction(() => {
  const demoUsers = db
    .prepare(
      `SELECT id, email FROM users
       WHERE email LIKE '%@deepkamal.demo'
          OR email LIKE '%@example.%'
          OR name IN ('Owner', 'Operations Manager', 'Field Worker', 'Customer', 'Walk-in Customer')`
    )
    .all();

  // Keep role logins owner/manager/partner/customer@deepkamal.in — only strip .demo and fake names above if email is demo
  const removeIds = demoUsers
    .filter((u) => /@deepkamal\.demo$/i.test(u.email) || /@example\./i.test(u.email))
    .map((u) => u.id);

  for (const table of [
    'quotation_items',
    'quotations',
    'work_evidence',
    'feedback',
    'salary_claims',
    'orders',
    'tickets',
    'site_works',
    'attendance',
    'activity_log',
    'bank_accounts'
  ]) {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
    } catch (_) {
      /* table may not exist */
    }
  }

  // Remove test clients (keep none — start clean for live ops)
  db.prepare('DELETE FROM sites').run();
  db.prepare('DELETE FROM clients').run();

  // Unlink customer users from deleted clients
  db.prepare('UPDATE users SET client_id = NULL WHERE client_id IS NOT NULL').run();

  if (removeIds.length) {
    db.prepare(`DELETE FROM users WHERE id IN (${removeIds.map(() => '?').join(',')})`).run(...removeIds);
  }

  // Deactivate obsolete uncoloured wire SKUs replaced by colour variants
  db.prepare(
    `UPDATE materials SET active = 0
     WHERE sku IN ('EL-WR-15','EL-WR-25','EL-WR-40','EL-WR-60','EL-WR-10','EL-WR-16','EL-WR-25C','EL-WR-35','EL-WR-50')`
  ).run();

  return { removedUsers: removeIds.length };
})();

db.pragma('foreign_keys = ON');

const counts = {
  users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
  materials: db.prepare('SELECT COUNT(*) AS c FROM materials WHERE active = 1').get().c,
  clients: db.prepare('SELECT COUNT(*) AS c FROM clients').get().c,
  tickets: db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c,
  quotations: db.prepare('SELECT COUNT(*) AS c FROM quotations').get().c,
  orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c
};

console.log('Dummy / transactional data purged.');
console.log(`Removed demo users: ${result.removedUsers}`);
console.log('Remaining counts:', counts);
console.log('Staff & materials catalog kept. Add real clients from the app.');
