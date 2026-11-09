const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { status: supabaseStatus } = require('../lib/supabase');

const router = express.Router();

async function count(sql) {
  return Number((await db.prepare(sql).get()).c);
}

async function snapshot() {
  const [
    users,
    services,
    categories,
    tickets,
    orders,
    clients,
    attendance,
    people,
    materials,
    quotations,
    invoices,
    assets,
    vendors
  ] = await Promise.all([
    count('SELECT COUNT(*) AS c FROM users'),
    count('SELECT COUNT(*) AS c FROM services'),
    count('SELECT COUNT(*) AS c FROM service_categories'),
    count('SELECT COUNT(*) AS c FROM tickets'),
    count('SELECT COUNT(*) AS c FROM orders'),
    count('SELECT COUNT(*) AS c FROM clients'),
    count('SELECT COUNT(*) AS c FROM attendance'),
    count(`SELECT COUNT(*) AS c FROM users WHERE role IN ('admin','manager','resource')`),
    count('SELECT COUNT(*) AS c FROM materials'),
    count('SELECT COUNT(*) AS c FROM quotations'),
    count('SELECT COUNT(*) AS c FROM invoices'),
    count('SELECT COUNT(*) AS c FROM site_assets'),
    count('SELECT COUNT(*) AS c FROM vendors')
  ]);
  const counts = {
    users,
    services,
    categories,
    tickets,
    orders,
    clients,
    attendance,
    people,
    materials,
    quotations,
    invoices,
    assets,
    vendors
  };

  if (db.driver === 'postgres') {
    return {
      ok: true,
      engine: 'postgres',
      driver: 'pg',
      path: db.dbPath,
      exists: true,
      sizeBytes: 0,
      journalMode: null,
      supabase: supabaseStatus(),
      counts
    };
  }

  const dbPath = db.dbPath;
  const exists = dbPath && fs.existsSync(dbPath);
  const sizeBytes = exists ? fs.statSync(dbPath).size : 0;
  let journalMode = null;
  try {
    if (typeof db.pragma === 'function') {
      journalMode = db.pragma('journal_mode', { simple: true });
    }
  } catch (_) {
    /* ignore */
  }

  return {
    ok: true,
    engine: 'sqlite3',
    driver: 'better-sqlite3',
    path: dbPath,
    exists,
    sizeBytes,
    journalMode,
    supabase: supabaseStatus(),
    counts
  };
}

router.get('/status', async (_req, res) => {
  try {
    res.json(await snapshot());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/ping-write', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const code = `PING-${Date.now()}`;
    await db
      .prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'db', 0)`)
      .run(_req.user.id, `Database write test ${code}`);
    const row = await db.prepare(`SELECT id, message, created_at FROM activity_log ORDER BY id DESC LIMIT 1`).get();
    res.json({ ok: true, wrote: row, status: await snapshot() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/backup', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    if (db.driver === 'postgres') {
      return res.json({
        ok: true,
        note: 'Postgres/Supabase is the live store — use Supabase backups / npm run backup:nightly export.',
        supabase: supabaseStatus(),
        status: await snapshot()
      });
    }
    const backupDir = path.join(__dirname, '..', '..', 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    if (typeof db.checkpoint === 'function') db.checkpoint();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `deepkamal-${stamp}.db`);
    fs.copyFileSync(db.dbPath, dest);
    res.json({
      ok: true,
      path: dest,
      sizeBytes: fs.statSync(dest).size,
      supabase: supabaseStatus()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
