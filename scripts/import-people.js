const bcrypt = require('bcryptjs');
const db = require('../server/db');

const hash = bcrypt.hashSync('DK-Worker-2026', 10);
const managerHash = bcrypt.hashSync('DK-Manager-2026', 10);

function emailFrom(name, role) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '.');
  return `${base || 'user'}@deepkamal.local`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const managers = ['Pankaj Kapre', 'Jiten Jadav'];
const resources = [
  'Mukesh Kanojiya',
  'Rakesh Kanojiya',
  'Harkesh Kanojiya',
  'Rajrsh Kanojiya',
  'Sunil Kumar',
  'Jayprakash Gupta',
  'Mithalesh Kumar',
  'Amir Ali',
  'Rambachan',
  'Yogendar',
  'Shyam Sundar Gupta',
  'Yadavji',
  'Rahul Chorasiya',
  'Salman Ali Corcut'
];

const insert = db.prepare(`
  INSERT INTO users (
    email, password_hash, name, role, initials, avatar_color, job_title, team,
    daily_wage, availability, kyc_identity, kyc_bank, kyc_consent, kyc_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', 'Pending', 'Pending', 'Not received', 'Action required')
`);

const exists = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE');
let added = 0;
let skipped = 0;

for (const name of managers) {
  const email = emailFrom(name);
  if (exists.get(email)) {
    skipped += 1;
    continue;
  }
  insert.run(email, managerHash, name, 'manager', initials(name), 'blue', 'Operations Manager', 'Operations', 0);
  added += 1;
  console.log('Manager:', name, '→', email);
}

const colors = ['blue', 'green', 'gold', 'purple'];
resources.forEach((name, i) => {
  const email = emailFrom(name);
  if (exists.get(email)) {
    skipped += 1;
    return;
  }
  insert.run(
    email,
    hash,
    name,
    'resource',
    initials(name),
    colors[i % colors.length],
    'Field Technician',
    'Field',
    0
  );
  added += 1;
  console.log('Resource:', name, '→', email);
});

console.log(`Done. Added ${added}, skipped ${skipped} existing.`);
console.log('Default passwords: managers DK-Manager-2026 · resources DK-Worker-2026');
