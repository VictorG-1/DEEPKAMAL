-- Applied via Supabase MCP as ops_otp_crew_finance_v1
-- Partner engagement + payment lock + retained wages
ALTER TABLE users ADD COLUMN IF NOT EXISTS engagement_type TEXT DEFAULT 'daily_wage';
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_locked INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS retained_balance DOUBLE PRECISION DEFAULT 0;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS work_type TEXT DEFAULT 'daily_wage';

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS crew_required INTEGER DEFAULT 1;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS work_type TEXT DEFAULT 'daily_wage';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS order_id BIGINT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sale_value DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS purchase_value DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS labour_cost DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS material_cost DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cost_mode TEXT DEFAULT 'with_labour';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS start_otp_hash TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS complete_otp_hash TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS start_verified_at TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS complete_verified_at TEXT;

ALTER TABLE salary_claims ADD COLUMN IF NOT EXISTS gross_amount DOUBLE PRECISION;
ALTER TABLE salary_claims ADD COLUMN IF NOT EXISTS retained_amount DOUBLE PRECISION DEFAULT 0;
ALTER TABLE salary_claims ADD COLUMN IF NOT EXISTS net_amount DOUBLE PRECISION;
ALTER TABLE salary_claims ADD COLUMN IF NOT EXISTS week_key TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_pct DOUBLE PRECISION DEFAULT 50;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_due DOUBLE PRECISION DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_due DOUBLE PRECISION DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_paid_at TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completion_paid_at TEXT;

CREATE TABLE IF NOT EXISTS ticket_crew (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id),
  role_on_job TEXT DEFAULT 'helper',
  day_wage DOUBLE PRECISION DEFAULT 0,
  work_type TEXT DEFAULT 'daily_wage',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(ticket_id, user_id)
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id BIGSERIAL PRIMARY KEY,
  purpose TEXT NOT NULL,
  target TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  user_id BIGINT,
  payload TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_otp_purpose_target ON otp_codes(purpose, target);
CREATE INDEX IF NOT EXISTS idx_ticket_crew_ticket ON ticket_crew(ticket_id);
