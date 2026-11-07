const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'deepkamal.db');
const db = new Database(dbPath);

// DELETE mode = single deepkamal.db file (easier to verify on Windows than WAL)
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','manager','resource','customer')),
      initials TEXT,
      avatar_color TEXT DEFAULT 'blue',
      job_title TEXT,
      team TEXT,
      phone TEXT,
      daily_wage REAL DEFAULT 0,
      availability TEXT DEFAULT 'Available',
      kyc_identity TEXT DEFAULT 'Pending',
      kyc_bank TEXT DEFAULT 'Pending',
      kyc_consent TEXT DEFAULT 'Not received',
      kyc_status TEXT DEFAULT 'Action required',
      wage_balance REAL DEFAULT 0,
      claims_this_month INTEGER DEFAULT 0,
      client_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      sites_count INTEGER DEFAULT 1,
      amc_status TEXT DEFAULT 'Active AMC',
      amc_expires TEXT,
      referral_code TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      planned_material REAL DEFAULT 0,
      used_material REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      client_id INTEGER REFERENCES clients(id),
      site_id INTEGER REFERENCES sites(id),
      assigned_user_id INTEGER REFERENCES users(id),
      priority TEXT DEFAULT 'Normal' CHECK(priority IN ('Normal','High','Critical')),
      status TEXT DEFAULT 'Unassigned' CHECK(status IN ('Unassigned','In progress','Resolved','Closed')),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client_id INTEGER REFERENCES clients(id),
      site_id INTEGER REFERENCES sites(id),
      team TEXT,
      progress INTEGER DEFAULT 0,
      due_date TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present','Half day','Absent')),
      site_id INTEGER REFERENCES sites(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS service_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES service_categories(id),
      icon TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      duration_mins INTEGER DEFAULT 60,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      customer_user_id INTEGER NOT NULL REFERENCES users(id),
      client_id INTEGER REFERENCES clients(id),
      site_id INTEGER REFERENCES sites(id),
      service_id INTEGER REFERENCES services(id),
      service_name TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'CONFIRMED',
      payment_status TEXT DEFAULT 'Paid',
      address TEXT,
      slot TEXT,
      booked_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      client_id INTEGER REFERENCES clients(id),
      site_id INTEGER REFERENCES sites(id),
      scope TEXT NOT NULL,
      amount REAL NOT NULL,
      first_payment REAL DEFAULT 0,
      status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Approved','Rejected')),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'Nos',
      rate REAL NOT NULL DEFAULT 0,
      gst_pct REAL DEFAULT 18,
      description TEXT,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      material_id INTEGER REFERENCES materials(id),
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'Nos',
      qty REAL NOT NULL DEFAULT 1,
      rate REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_name TEXT NOT NULL,
      account_type TEXT DEFAULT 'Current account',
      suffix TEXT NOT NULL,
      active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS salary_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Paid')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code TEXT,
      order_id INTEGER REFERENCES orders(id),
      customer_user_id INTEGER REFERENCES users(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      recommend TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_work_id INTEGER REFERENCES site_works(id),
      ticket_id INTEGER REFERENCES tickets(id),
      user_id INTEGER REFERENCES users(id),
      captured_at TEXT,
      latitude REAL,
      longitude REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      message TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_stock (
      material_id INTEGER PRIMARY KEY REFERENCES materials(id),
      qty REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      site_id INTEGER REFERENCES sites(id),
      qty REAL NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('IN','OUT')),
      ref_type TEXT,
      ref_id INTEGER,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('quotation','order','invoice')),
      entity_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT DEFAULT 'UPI',
      status TEXT DEFAULT 'Paid' CHECK(status IN ('Pending','Paid','Failed','Refunded')),
      reference TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      site_id INTEGER REFERENCES sites(id),
      asset_type TEXT NOT NULL,
      name TEXT NOT NULL,
      serial_no TEXT,
      location_note TEXT,
      capacity TEXT,
      installed_on TEXT,
      last_service_on TEXT,
      next_service_due TEXT,
      next_refill_due TEXT,
      next_hydro_due TEXT,
      status TEXT DEFAULT 'Active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS amc_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      site_id INTEGER REFERENCES sites(id),
      title TEXT NOT NULL,
      visit_type TEXT DEFAULT 'Preventive',
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Ticketed','Done','Skipped')),
      ticket_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      client_id INTEGER REFERENCES clients(id),
      quotation_id INTEGER,
      order_id INTEGER,
      invoice_date TEXT,
      due_date TEXT,
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      amount REAL NOT NULL,
      amount_paid REAL DEFAULT 0,
      status TEXT DEFAULT 'Unpaid' CHECK(status IN ('Draft','Unpaid','Partial','Paid','CreditNote')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      hsn TEXT,
      qty REAL DEFAULT 1,
      unit TEXT DEFAULT 'Nos',
      rate REAL DEFAULT 0,
      gst_pct REAL DEFAULT 18,
      tax_amount REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      vendor_id INTEGER REFERENCES vendors(id),
      status TEXT DEFAULT 'Open' CHECK(status IN ('Draft','Open','Partial','Received','Cancelled')),
      notes TEXT,
      total REAL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      material_id INTEGER REFERENCES materials(id),
      description TEXT NOT NULL,
      qty REAL NOT NULL,
      received_qty REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      amount REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      recipient TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      link TEXT,
      status TEXT DEFAULT 'Queued',
      entity_type TEXT,
      entity_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id),
      quotation_id INTEGER,
      quoted_amount REAL DEFAULT 0,
      material_cost REAL DEFAULT 0,
      labour_cost REAL DEFAULT 0,
      other_cost REAL DEFAULT 0,
      actual_total REAL DEFAULT 0,
      margin REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      user_id INTEGER,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      role TEXT,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS asset_service_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES site_assets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      notes TEXT,
      performed_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS print_tokens (
      token TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Safe column adds for older DBs
  function addCol(table, name, ddl) {
    const have = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }

  addCol('services', 'category_id', 'INTEGER REFERENCES service_categories(id)');
  addCol('services', 'duration_mins', 'INTEGER DEFAULT 60');
  addCol('orders', 'address', 'TEXT');
  addCol('orders', 'slot', 'TEXT');

  addCol('clients', 'phone', 'TEXT');
  addCol('clients', 'email', 'TEXT');
  addCol('clients', 'gstin', 'TEXT');
  addCol('clients', 'address', 'TEXT');
  addCol('clients', 'contact_person', 'TEXT');

  addCol('materials', 'hsn', 'TEXT');
  addCol('materials', 'color_name', 'TEXT');
  addCol('materials', 'color_hex', 'TEXT');
  addCol('materials', 'barcode', 'TEXT');

  addCol('quotations', 'title', 'TEXT');
  addCol('quotations', 'contact_name', 'TEXT');
  addCol('quotations', 'contact_phone', 'TEXT');
  addCol('quotations', 'contact_email', 'TEXT');
  addCol('quotations', 'site_address', 'TEXT');
  addCol('quotations', 'quote_date', 'TEXT');
  addCol('quotations', 'valid_until', 'TEXT');
  addCol('quotations', 'payment_terms', 'TEXT');
  addCol('quotations', 'delivery_terms', 'TEXT');
  addCol('quotations', 'warranty_terms', 'TEXT');
  addCol('quotations', 'notes', 'TEXT');
  addCol('quotations', 'exclusions', 'TEXT');
  addCol('quotations', 'discount_pct', 'REAL DEFAULT 0');
  addCol('quotations', 'discount_amount', 'REAL DEFAULT 0');
  addCol('quotations', 'subtotal', 'REAL DEFAULT 0');
  addCol('quotations', 'tax_amount', 'REAL DEFAULT 0');
  addCol('quotations', 'round_off', 'REAL DEFAULT 0');
  addCol('quotations', 'gst_mode', "TEXT DEFAULT 'exclusive'");
  addCol('quotations', 'place_of_supply', 'TEXT');
  addCol('quotations', 'company_gstin', 'TEXT');
  addCol('quotations', 'client_gstin', 'TEXT');
  addCol('quotations', 'revision', 'INTEGER DEFAULT 1');
  addCol('quotations', 'prepared_by_name', 'TEXT');
  addCol('quotations', 'updated_at', 'TEXT');

  addCol('quotation_items', 'sku', 'TEXT');
  addCol('quotation_items', 'category', 'TEXT');
  addCol('quotation_items', 'hsn', 'TEXT');
  addCol('quotation_items', 'gst_pct', 'REAL DEFAULT 18');
  addCol('quotation_items', 'tax_amount', 'REAL DEFAULT 0');
  addCol('quotation_items', 'specs', 'TEXT');

  addCol('quotations', 'amount_paid', 'REAL DEFAULT 0');
  addCol('quotations', 'ticket_id', 'INTEGER');
  addCol('quotations', 'converted_at', 'TEXT');
  addCol('orders', 'amount_paid', 'REAL DEFAULT 0');
  addCol('tickets', 'quotation_id', 'INTEGER');
  addCol('work_evidence', 'photo_path', 'TEXT');
  addCol('clients', 'amc_expires', 'TEXT');
  addCol('materials', 'reorder_level', 'REAL DEFAULT 50');
  addCol('inventory_stock', 'reorder_level', 'REAL');

  addCol('users', 'pin_hash', 'TEXT');
  addCol('users', 'must_change_password', 'INTEGER DEFAULT 0');
  addCol('users', 'login_pin_hint', 'TEXT');

  addCol('attendance', 'latitude', 'REAL');
  addCol('attendance', 'longitude', 'REAL');
  addCol('attendance', 'check_in_at', 'TEXT');
  addCol('attendance', 'geo_accuracy', 'REAL');

  addCol('site_assets', 'qr_token', 'TEXT');
  addCol('sites', 'latitude', 'REAL');
  addCol('sites', 'longitude', 'REAL');
  addCol('users', 'home_lat', 'REAL');
  addCol('users', 'home_lng', 'REAL');

  // Ensure every asset has a scannable QR token
  const assetsMissingQr = db.prepare(`SELECT id FROM site_assets WHERE qr_token IS NULL OR qr_token = ''`).all();
  const setQr = db.prepare(`UPDATE site_assets SET qr_token = ? WHERE id = ?`);
  for (const a of assetsMissingQr) {
    setQr.run(`DKA${String(a.id).padStart(5, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`, a.id);
  }

  // Widen payments.entity_type to allow 'invoice'
  const paySql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'`).get()?.sql || '';
  if (paySql && paySql.includes('entity_type') && !paySql.includes("'invoice'")) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE payments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT DEFAULT 'UPI',
        status TEXT DEFAULT 'Paid',
        reference TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO payments_new SELECT * FROM payments;
      DROP TABLE payments;
      ALTER TABLE payments_new RENAME TO payments;
    `);
    db.pragma('foreign_keys = ON');
  }

  // Widen ticket statuses without breaking FKs that still point at renamed tables
  const ticketSql = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'`)
    .get()?.sql || '';
  const needsStatusWiden =
    ticketSql.includes(`CHECK(status IN ('Unassigned','In progress','Resolved','Closed'))`) ||
    (ticketSql.includes(`'Unassigned'`) && !ticketSql.includes(`'On the way'`));
  if (needsStatusWiden && ticketSql) {
    db.pragma('foreign_keys = OFF');
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
        updated_at TEXT DEFAULT (datetime('now')),
        quotation_id INTEGER
      );
      INSERT INTO tickets_new (id, code, title, description, client_id, site_id, assigned_user_id, priority, status, created_by, created_at, updated_at)
      SELECT id, code, title, description, client_id, site_id, assigned_user_id, priority, status, created_by, created_at, updated_at FROM tickets;
      DROP TABLE tickets;
      ALTER TABLE tickets_new RENAME TO tickets;
    `);
    db.pragma('foreign_keys = ON');
  }
}

migrate();

function checkpoint() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_) {
    /* ignore */
  }
}

process.on('exit', checkpoint);
process.on('SIGINT', () => {
  checkpoint();
  process.exit(0);
});
process.on('SIGTERM', () => {
  checkpoint();
  process.exit(0);
});

module.exports = db;
module.exports.dbPath = dbPath;
module.exports.checkpoint = checkpoint;
