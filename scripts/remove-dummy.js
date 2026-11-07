const db = require('../server/db');

const dummy = db
  .prepare(
    `SELECT id, email, name FROM users
     WHERE email LIKE '%@deepkamal.demo'
        OR name IN ('Owner', 'Operations Manager', 'Field Worker', 'Customer')`
  )
  .all();

const ids = dummy.map((u) => u.id);
console.log(
  'Dummy accounts to remove:',
  dummy.map((u) => `${u.name} <${u.email}>`).join(', ') || '(none)'
);

db.pragma('foreign_keys = OFF');

const clearOps = db.transaction(() => {
  for (const table of [
    'activity_log',
    'work_evidence',
    'feedback',
    'salary_claims',
    'orders',
    'quotations',
    'tickets',
    'site_works',
    'attendance',
    'bank_accounts',
    'services',
    'sites',
    'clients'
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }

  if (ids.length) {
    db.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
});

clearOps();
db.pragma('foreign_keys = ON');

db.prepare(`
  UPDATE users
  SET role = 'admin', job_title = 'Owner / Super Admin', team = 'Leadership'
  WHERE email = 'pankaj.kapre@deepkamal.local'
`).run();

const users = db
  .prepare(
    `SELECT name, email, role FROM users
     ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'resource' THEN 2 ELSE 3 END, name`
  )
  .all();

console.log(`Removed ${ids.length} dummy user(s). Operational tables cleared.`);
console.log('Remaining staff:');
users.forEach((u) => console.log(`  [${u.role}] ${u.name} <${u.email}>`));
console.log('Owner login: pankaj.kapre@deepkamal.local / DK-Manager-2026');
