const bcrypt = require('bcryptjs');
const db = require('./db');
const { toBarcode } = require('./lib/barcode');
const { starterPinFor, hashPin } = require('./lib/pins');

const PASSWORD = 'DeepKamal@1';

function upsertUser({ email, password, name, role, initials, color, title, team, wage = 0, kyc = 'Pending' }) {
  const existing = db.prepare('SELECT id, pin_hash FROM users WHERE email = ? COLLATE NOCASE').get(email);
  if (existing) {
    // Do NOT reset password on every boot — partners keep their own PIN/password
    db.prepare(`
      UPDATE users SET name = ?, role = ?, initials = ?, avatar_color = ?,
        job_title = ?, team = ?, daily_wage = ?, kyc_status = ?
      WHERE id = ?
    `).run(name, role, initials, color, title, team, wage, kyc, existing.id);
    if (role === 'resource' && !existing.pin_hash) {
      const pin = starterPinFor(existing.id, name);
      db.prepare(`UPDATE users SET pin_hash = ?, login_pin_hint = ?, must_change_password = 1 WHERE id = ?`).run(
        hashPin(pin),
        `****${pin.slice(-2)}`,
        existing.id
      );
    }
    return existing.id;
  }
  const hash = bcrypt.hashSync(password, 10);
  const id = db.prepare(`
    INSERT INTO users (
      email, password_hash, name, role, initials, avatar_color, job_title, team,
      daily_wage, availability, kyc_identity, kyc_bank, kyc_consent, kyc_status, must_change_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?, ?, ?)
  `).run(
    email,
    hash,
    name,
    role,
    initials,
    color,
    title,
    team,
    wage,
    kyc === 'Verified' ? 'Aadhaar & PAN verified' : 'Pending',
    kyc === 'Verified' ? 'Bank on file' : 'Pending',
    kyc === 'Verified' ? 'Granted' : 'Not received',
    kyc,
    role === 'resource' ? 1 : 0
  ).lastInsertRowid;
  if (role === 'resource') {
    const pin = starterPinFor(id, name);
    db.prepare(`UPDATE users SET pin_hash = ?, login_pin_hint = ? WHERE id = ?`).run(
      hashPin(pin),
      `****${pin.slice(-2)}`,
      id
    );
  }
  return id;
}

function ensurePartnerPins() {
  const partners = db.prepare(`SELECT id, name, pin_hash FROM users WHERE role = 'resource'`).all();
  const pins = [];
  for (const p of partners) {
    if (p.pin_hash) continue;
    const pin = starterPinFor(p.id, p.name);
    db.prepare(`UPDATE users SET pin_hash = ?, login_pin_hint = ?, must_change_password = 1 WHERE id = ?`).run(
      hashPin(pin),
      `****${pin.slice(-2)}`,
      p.id
    );
    pins.push({ id: p.id, name: p.name, pin });
  }
  return pins;
}

function seedLogins() {
  // Real workspace logins only — no @deepkamal.demo aliases
  const accounts = [
    ['owner@deepkamal.in', 'DeepKamal Owner', 'admin', 'DK', 'gold', 'Owner', 'Leadership', 0, 'Verified'],
    ['manager@deepkamal.in', 'Operations Manager', 'manager', 'OM', 'blue', 'Operations Manager', 'Operations', 0, 'Verified'],
    ['partner@deepkamal.in', 'Field Partner', 'resource', 'FP', 'green', 'Lead Technician', 'Field', 1200, 'Verified'],
    ['customer@deepkamal.in', 'Customer', 'customer', 'CU', 'purple', 'Customer', null, 0, 'Verified']
  ];
  for (const [email, name, role, initials, color, title, team, wage, kyc] of accounts) {
    upsertUser({ email, password: PASSWORD, name, role, initials, color, title, team, wage, kyc });
  }
  // Drop legacy demo accounts if still present
  db.prepare(`DELETE FROM users WHERE email LIKE '%@deepkamal.demo'`).run();
}

function seedStaff() {
  const managers = [
    ['Pankaj Kapre', 'pankaj.kapre@deepkamal.in'],
    ['Jiten Jadav', 'jiten.jadav@deepkamal.in']
  ];
  for (const [name, email] of managers) {
    const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    upsertUser({
      email,
      password: PASSWORD,
      name,
      role: 'manager',
      initials,
      color: 'blue',
      title: 'Operations Manager',
      team: 'Operations',
      kyc: 'Verified'
    });
  }

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
  const colors = ['blue', 'green', 'gold', 'purple'];
  resources.forEach((name, i) => {
    const email = `${name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '.')}@deepkamal.in`;
    const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    upsertUser({
      email,
      password: PASSWORD,
      name,
      role: 'resource',
      initials,
      color: colors[i % colors.length],
      title: 'Field Technician',
      team: 'Field',
      wage: 1000,
      kyc: 'Pending'
    });
  });
}

function seedCatalog() {
  if (db.prepare('SELECT COUNT(*) AS c FROM service_categories').get().c > 0) return;

  const insertCat = db.prepare(`INSERT INTO service_categories (name, icon, sort_order) VALUES (?, ?, ?)`);
  const cats = [
    insertCat.run('Fire Safety', '♨', 1).lastInsertRowid,
    insertCat.run('Electrical', '⚡', 2).lastInsertRowid,
    insertCat.run('AMC & Maintenance', '▣', 3).lastInsertRowid,
    insertCat.run('Emergency', '◌', 4).lastInsertRowid
  ];

  const insertSvc = db.prepare(`
    INSERT INTO services (category_id, icon, name, description, price, duration_mins, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const services = [
    [cats[0], '♨', 'Fire safety audit', 'Certified inspection with compliance report', 7500, 180],
    [cats[0], '◉', 'Fire alarm service', 'Fault inspection and standard servicing', 3500, 90],
    [cats[0], '▣', 'Extinguisher servicing', 'Refill, pressure test and tagging', 1800, 60],
    [cats[1], '⚡', 'Electrical maintenance', 'Preventive electrical visit for your site', 4800, 120],
    [cats[1], '◫', 'Panel inspection', 'MDB / DB health check and report', 3200, 90],
    [cats[1], '◈', 'Installation survey', 'Site survey for new electrical / fire system', 1500, 60],
    [cats[2], '▤', 'Fire extinguisher AMC', 'Annual maintenance cover per site', 12000, 0],
    [cats[2], '▦', 'Electrical AMC', 'Scheduled electrical preventive visits', 18000, 0],
    [cats[3], '◌', 'Emergency site visit', 'Priority technician dispatch', 2500, 60],
    [cats[3], '!', 'Critical fault callout', 'Same-day critical electrical / fire response', 4500, 90]
  ];
  for (const row of services) insertSvc.run(...row);
}

function seedMaterials() {
  const catalog = require('./materials-catalog');
  const upsert = db.prepare(`
    INSERT INTO materials (sku, category, name, unit, rate, gst_pct, description, color_name, color_hex, barcode, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(sku) DO UPDATE SET
      category = excluded.category,
      name = excluded.name,
      unit = excluded.unit,
      rate = excluded.rate,
      gst_pct = excluded.gst_pct,
      description = excluded.description,
      color_name = excluded.color_name,
      color_hex = excluded.color_hex,
      barcode = excluded.barcode,
      active = 1,
      sort_order = excluded.sort_order
  `);
  const tx = db.transaction((rows) => {
    rows.forEach((row, i) => {
      const [sku, category, name, unit, rate, gst, description, colorName, colorHex] = row;
      upsert.run(
        sku,
        category,
        name,
        unit,
        rate,
        gst,
        description || null,
        colorName || null,
        colorHex || null,
        toBarcode(sku),
        i + 1
      );
    });
  });
  tx(catalog);

  // Ensure every active material has a barcode
  const missing = db.prepare(`SELECT id, sku FROM materials WHERE barcode IS NULL OR barcode = ''`).all();
  const fix = db.prepare('UPDATE materials SET barcode = ? WHERE id = ?');
  for (const m of missing) fix.run(toBarcode(m.sku), m.id);

  // Hide legacy uncoloured wire SKUs
  db.prepare(
    `UPDATE materials SET active = 0
     WHERE sku IN ('EL-WR-15','EL-WR-25','EL-WR-40','EL-WR-60','EL-WR-10','EL-WR-16','EL-WR-25C','EL-WR-35','EL-WR-50')`
  ).run();
}

function seedInventory() {
  const { seedInitialStock } = require('./lib/inventory');
  seedInitialStock(500);
}

function seedBanks() {
  if (db.prepare('SELECT COUNT(*) AS c FROM bank_accounts').get().c > 0) return;
  db.prepare(`INSERT INTO bank_accounts (bank_name, account_type, suffix, active) VALUES (?, ?, ?, 1)`)
    .run('HDFC Bank', 'Current account', '4821');
  db.prepare(`INSERT INTO bank_accounts (bank_name, account_type, suffix, active) VALUES (?, ?, ?, 0)`)
    .run('ICICI Bank', 'Current account', '9033');
}

function seedVendorsAndAssets() {
  if (db.prepare('SELECT COUNT(*) AS c FROM vendors').get().c === 0) {
    db.prepare(`INSERT INTO vendors (name, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?)`).run(
      'ElectroTrade Mumbai',
      '9820001111',
      'sales@electrotrade.example',
      '27AABCE1234F1Z5',
      'Kurla, Mumbai'
    );
    db.prepare(`INSERT INTO vendors (name, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?)`).run(
      'FireSafe Supplies',
      '9820002222',
      'orders@firesafe.example',
      '27AABCF9876G1Z2',
      'Bhiwandi'
    );
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM site_assets').get().c === 0) {
    const client = db.prepare('SELECT id FROM clients ORDER BY id LIMIT 1').get();
    if (client) {
      const site = db.prepare('SELECT id FROM sites WHERE client_id = ? LIMIT 1').get(client.id);
      const ins = db.prepare(
        `INSERT INTO site_assets (client_id, site_id, asset_type, name, serial_no, location_note, capacity, installed_on, last_service_on, next_service_due, next_refill_due, next_hydro_due, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, date('now','-180 day'), date('now','-30 day'), date('now','+15 day'), date('now','+20 day'), date('now','+200 day'), 'Active')`
      );
      ins.run(client.id, site?.id || null, 'Extinguisher', 'ABC 6kg — Lobby', 'EX-ABC-1001', 'Main lobby', '6 kg');
      ins.run(client.id, site?.id || null, 'Hydrant', 'Landing valve L2', 'HY-2002', 'Staircase L2', '63 mm');
      ins.run(client.id, site?.id || null, 'Panel', 'Fire alarm panel', 'FA-3003', 'Security room', '4 zone');
    }
  }
}

function seedCustomerClient() {
  const user = db.prepare(`SELECT * FROM users WHERE email = 'customer@deepkamal.in'`).get();
  if (!user) return;
  if (user.client_id) {
    db.prepare(`UPDATE clients SET amc_expires = COALESCE(amc_expires, date('now', '+20 day')) WHERE id = ?`).run(user.client_id);
    return;
  }
  const clientId = db
    .prepare(
      `INSERT INTO clients (name, location, address, phone, email, gstin, contact_person, sites_count, amc_status, amc_expires, referral_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'Active AMC', date('now', '+20 day'), ?)`
    )
    .run(
      'Walk-in Customer Account',
      'Mumbai',
      'Andheri East',
      '9999999999',
      'customer@deepkamal.in',
      null,
      'Customer',
      'CUST250'
    ).lastInsertRowid;
  db.prepare(`INSERT INTO sites (client_id, name, address, city) VALUES (?, 'Primary site', ?, 'Mumbai')`)
    .run(clientId, 'Andheri East');
  db.prepare(`UPDATE users SET client_id = ? WHERE id = ?`).run(clientId, user.id);
}

function seed() {
  seedLogins();
  seedStaff();
  seedCatalog();
  seedMaterials();
  seedInventory();
  seedBanks();
  seedCustomerClient();
  seedVendorsAndAssets();
  const newPins = ensurePartnerPins();
  const materials = db.prepare('SELECT COUNT(*) AS c FROM materials WHERE active = 1').get().c;
  const coloured = db.prepare(`SELECT COUNT(*) AS c FROM materials WHERE active = 1 AND color_name IS NOT NULL`).get().c;
  const barcodes = db.prepare(`SELECT COUNT(*) AS c FROM materials WHERE active = 1 AND barcode IS NOT NULL`).get().c;
  const stockRows = db.prepare('SELECT COUNT(*) AS c FROM inventory_stock').get().c;
  console.log('Database ready at data/deepkamal.db');
  console.log(`Materials: ${materials} active · ${coloured} colour-coded · ${barcodes} with barcodes · stock rows ${stockRows}`);
  console.log('Owner/manager/customer password: DeepKamal@1');
  console.log('  owner@deepkamal.in · manager@deepkamal.in · customer@deepkamal.in');
  console.log('Partners: use email + personal PIN (Team → Reset PIN), or temporary password after reset.');
  if (newPins.length) {
    console.log(`Assigned starter PINs to ${newPins.length} partner(s). Use Team → Reset PIN to reveal.`);
  }
}

seed();
