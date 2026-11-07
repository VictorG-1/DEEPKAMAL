-- DeepKamal ops: SQLite schema converted to PostgreSQL
-- Migration 001

-- ---------------------------------------------------------------------------
-- Tables (dependency order)
-- ---------------------------------------------------------------------------

CREATE TABLE clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  sites_count INTEGER DEFAULT 1,
  amc_status TEXT DEFAULT 'Active AMC',
  amc_expires TEXT,
  referral_code TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  contact_person TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'resource', 'customer')),
  initials TEXT,
  avatar_color TEXT DEFAULT 'blue',
  job_title TEXT,
  team TEXT,
  phone TEXT,
  daily_wage DOUBLE PRECISION DEFAULT 0,
  availability TEXT DEFAULT 'Available',
  kyc_identity TEXT DEFAULT 'Pending',
  kyc_bank TEXT DEFAULT 'Pending',
  kyc_consent TEXT DEFAULT 'Not received',
  kyc_status TEXT DEFAULT 'Action required',
  wage_balance DOUBLE PRECISION DEFAULT 0,
  claims_this_month INTEGER DEFAULT 0,
  client_id BIGINT REFERENCES clients (id),
  pin_hash TEXT,
  must_change_password INTEGER DEFAULT 0,
  login_pin_hint TEXT,
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE sites (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  planned_material DOUBLE PRECISION DEFAULT 0,
  used_material DOUBLE PRECISION DEFAULT 0,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  client_id BIGINT REFERENCES clients (id),
  site_id BIGINT REFERENCES sites (id),
  assigned_user_id BIGINT REFERENCES users (id),
  priority TEXT DEFAULT 'Normal' CHECK (priority IN ('Normal', 'High', 'Critical')),
  status TEXT DEFAULT 'Unassigned',
  created_by BIGINT REFERENCES users (id),
  quotation_id BIGINT,
  created_at TEXT DEFAULT (now()::text),
  updated_at TEXT DEFAULT (now()::text)
);

CREATE TABLE site_works (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  client_id BIGINT REFERENCES clients (id),
  site_id BIGINT REFERENCES sites (id),
  team TEXT,
  progress INTEGER DEFAULT 0,
  due_date TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE attendance (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Half day', 'Absent')),
  site_id BIGINT REFERENCES sites (id),
  notes TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  check_in_at TEXT,
  geo_accuracy DOUBLE PRECISION,
  created_at TEXT DEFAULT (now()::text),
  UNIQUE (user_id, date)
);

CREATE TABLE service_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE services (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES service_categories (id),
  icon TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price DOUBLE PRECISION NOT NULL,
  duration_mins INTEGER DEFAULT 60,
  active INTEGER DEFAULT 1
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  customer_user_id BIGINT NOT NULL REFERENCES users (id),
  client_id BIGINT REFERENCES clients (id),
  site_id BIGINT REFERENCES sites (id),
  service_id BIGINT REFERENCES services (id),
  service_name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  amount_paid DOUBLE PRECISION DEFAULT 0,
  status TEXT DEFAULT 'CONFIRMED',
  payment_status TEXT DEFAULT 'Paid',
  address TEXT,
  slot TEXT,
  booked_at TEXT DEFAULT (now()::text)
);

CREATE TABLE quotations (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  client_id BIGINT REFERENCES clients (id),
  site_id BIGINT REFERENCES sites (id),
  scope TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  first_payment DOUBLE PRECISION DEFAULT 0,
  amount_paid DOUBLE PRECISION DEFAULT 0,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Approved', 'Rejected')),
  created_by BIGINT REFERENCES users (id),
  title TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  site_address TEXT,
  quote_date TEXT,
  valid_until TEXT,
  payment_terms TEXT,
  delivery_terms TEXT,
  warranty_terms TEXT,
  notes TEXT,
  exclusions TEXT,
  discount_pct DOUBLE PRECISION DEFAULT 0,
  discount_amount DOUBLE PRECISION DEFAULT 0,
  subtotal DOUBLE PRECISION DEFAULT 0,
  tax_amount DOUBLE PRECISION DEFAULT 0,
  round_off DOUBLE PRECISION DEFAULT 0,
  gst_mode TEXT DEFAULT 'exclusive',
  place_of_supply TEXT,
  company_gstin TEXT,
  client_gstin TEXT,
  revision INTEGER DEFAULT 1,
  prepared_by_name TEXT,
  ticket_id BIGINT,
  converted_at TEXT,
  updated_at TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE materials (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Nos',
  rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  gst_pct DOUBLE PRECISION DEFAULT 18,
  description TEXT,
  hsn TEXT,
  color_name TEXT,
  color_hex TEXT,
  barcode TEXT,
  reorder_level DOUBLE PRECISION DEFAULT 50,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE quotation_items (
  id BIGSERIAL PRIMARY KEY,
  quotation_id BIGINT NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
  material_id BIGINT REFERENCES materials (id),
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Nos',
  qty DOUBLE PRECISION NOT NULL DEFAULT 1,
  rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  sku TEXT,
  category TEXT,
  hsn TEXT,
  gst_pct DOUBLE PRECISION DEFAULT 18,
  tax_amount DOUBLE PRECISION DEFAULT 0,
  specs TEXT
);

CREATE TABLE bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_type TEXT DEFAULT 'Current account',
  suffix TEXT NOT NULL,
  active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE salary_claims (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id),
  amount DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Paid')),
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE feedback (
  id BIGSERIAL PRIMARY KEY,
  ticket_code TEXT,
  order_id BIGINT REFERENCES orders (id),
  customer_user_id BIGINT REFERENCES users (id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  recommend TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE work_evidence (
  id BIGSERIAL PRIMARY KEY,
  site_work_id BIGINT REFERENCES site_works (id),
  ticket_id BIGINT REFERENCES tickets (id),
  user_id BIGINT REFERENCES users (id),
  captured_at TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  notes TEXT,
  photo_path TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users (id),
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE inventory_stock (
  material_id BIGINT PRIMARY KEY REFERENCES materials (id),
  qty DOUBLE PRECISION NOT NULL DEFAULT 0,
  reorder_level DOUBLE PRECISION,
  updated_at TEXT DEFAULT (now()::text)
);

CREATE TABLE inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials (id),
  site_id BIGINT REFERENCES sites (id),
  qty DOUBLE PRECISION NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  ref_type TEXT,
  ref_id BIGINT,
  notes TEXT,
  user_id BIGINT REFERENCES users (id),
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  method TEXT DEFAULT 'UPI',
  status TEXT DEFAULT 'Paid' CHECK (status IN ('Pending', 'Paid', 'Failed', 'Refunded')),
  reference TEXT,
  notes TEXT,
  created_by BIGINT REFERENCES users (id),
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE site_assets (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients (id),
  site_id BIGINT REFERENCES sites (id),
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
  qr_token TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE amc_visits (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients (id),
  site_id BIGINT REFERENCES sites (id),
  title TEXT NOT NULL,
  visit_type TEXT DEFAULT 'Preventive',
  due_date TEXT NOT NULL,
  status TEXT DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Ticketed', 'Done', 'Skipped')),
  ticket_id BIGINT,
  notes TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE invoices (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  client_id BIGINT REFERENCES clients (id),
  quotation_id BIGINT,
  order_id BIGINT,
  invoice_date TEXT,
  due_date TEXT,
  subtotal DOUBLE PRECISION DEFAULT 0,
  tax_amount DOUBLE PRECISION DEFAULT 0,
  amount DOUBLE PRECISION NOT NULL,
  amount_paid DOUBLE PRECISION DEFAULT 0,
  status TEXT DEFAULT 'Unpaid' CHECK (status IN ('Draft', 'Unpaid', 'Partial', 'Paid', 'CreditNote')),
  notes TEXT,
  created_by BIGINT REFERENCES users (id),
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn TEXT,
  qty DOUBLE PRECISION DEFAULT 1,
  unit TEXT DEFAULT 'Nos',
  rate DOUBLE PRECISION DEFAULT 0,
  gst_pct DOUBLE PRECISION DEFAULT 18,
  tax_amount DOUBLE PRECISION DEFAULT 0,
  amount DOUBLE PRECISION DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE vendors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  vendor_id BIGINT REFERENCES vendors (id),
  status TEXT DEFAULT 'Open' CHECK (status IN ('Draft', 'Open', 'Partial', 'Received', 'Cancelled')),
  notes TEXT,
  total DOUBLE PRECISION DEFAULT 0,
  created_by BIGINT REFERENCES users (id),
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE purchase_order_items (
  id BIGSERIAL PRIMARY KEY,
  po_id BIGINT NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  material_id BIGINT REFERENCES materials (id),
  description TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  received_qty DOUBLE PRECISION DEFAULT 0,
  rate DOUBLE PRECISION DEFAULT 0,
  amount DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  recipient TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  link TEXT,
  status TEXT DEFAULT 'Queued',
  entity_type TEXT,
  entity_id BIGINT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE job_costs (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL UNIQUE REFERENCES tickets (id),
  quotation_id BIGINT,
  quoted_amount DOUBLE PRECISION DEFAULT 0,
  material_cost DOUBLE PRECISION DEFAULT 0,
  labour_cost DOUBLE PRECISION DEFAULT 0,
  other_cost DOUBLE PRECISION DEFAULT 0,
  actual_total DOUBLE PRECISION DEFAULT 0,
  margin DOUBLE PRECISION DEFAULT 0,
  updated_at TEXT DEFAULT (now()::text)
);

CREATE TABLE offline_queue (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT,
  user_id BIGINT,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'Pending',
  created_at TEXT DEFAULT (now()::text),
  processed_at TEXT
);

CREATE TABLE ticket_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users (id),
  role TEXT,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE asset_service_log (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES site_assets (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  notes TEXT,
  performed_by BIGINT REFERENCES users (id),
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE print_tokens (
  token TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (now()::text)
);

-- ---------------------------------------------------------------------------
-- Row Level Security (explicitly off)
-- ---------------------------------------------------------------------------

ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE site_works DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE services DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE salary_claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_evidence DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE site_assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE amc_visits DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_costs DISABLE ROW LEVEL SECURITY;
ALTER TABLE offline_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_service_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE print_tokens DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Application role
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deepkamal_app') THEN
    CREATE ROLE deepkamal_app LOGIN PASSWORD 'DeepKamal_Supa_2026!';
  ELSE
    ALTER ROLE deepkamal_app WITH LOGIN PASSWORD 'DeepKamal_Supa_2026!';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO deepkamal_app;
GRANT CREATE ON SCHEMA public TO deepkamal_app;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO deepkamal_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO deepkamal_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO deepkamal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO deepkamal_app;

GRANT deepkamal_app TO postgres;

COMMENT ON SCHEMA public IS 'DeepKamal';

