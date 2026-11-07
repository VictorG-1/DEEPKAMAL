const fs = require('fs');
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function snapshot() {
  const exists = fs.existsSync(db.dbPath);
  const sizeBytes = exists ? fs.statSync(db.dbPath).size : 0;
  const { status: supabaseStatus } = require('../lib/supabase');
  return {
    ok: true,
    engine: 'sqlite3',
    driver: 'better-sqlite3',
    path: db.dbPath,
    exists,
    sizeBytes,
    journalMode: db.pragma('journal_mode', { simple: true }),
    supabase: supabaseStatus(),
    counts: {
      users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
      services: db.prepare('SELECT COUNT(*) AS c FROM services').get().c,
      categories: db.prepare('SELECT COUNT(*) AS c FROM service_categories').get().c,
      tickets: db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c,
      orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
      clients: db.prepare('SELECT COUNT(*) AS c FROM clients').get().c,
      attendance: db.prepare('SELECT COUNT(*) AS c FROM attendance').get().c,
      people: db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role IN ('admin','manager','resource')`).get().c,
      materials: db.prepare('SELECT COUNT(*) AS c FROM materials').get().c,
      quotations: db.prepare('SELECT COUNT(*) AS c FROM quotations').get().c,
      invoices: db.prepare('SELECT COUNT(*) AS c FROM invoices').get().c,
      assets: db.prepare('SELECT COUNT(*) AS c FROM site_assets').get().c,
      vendors: db.prepare('SELECT COUNT(*) AS c FROM vendors').get().c
    }
  };
}

router.get('/status', (_req, res) => {
  try {
    res.json(snapshot());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/ping-write', requireAuth, requireRole('admin'), (_req, res) => {
  try {
    const code = `PING-${Date.now()}`;
    db.prepare(
      `INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'db', 0)`
    ).run(_req.user.id, `Database write test ${code}`);
    const row = db.prepare(`SELECT id, message, created_at FROM activity_log ORDER BY id DESC LIMIT 1`).get();
    res.json({ ok: true, wrote: row, status: snapshot() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/backup', requireAuth, requireRole('admin'), (_req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(__dirname, '..', '..', 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    db.pragma('wal_checkpoint(TRUNCATE)');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `deepkamal-${stamp}.db`);
    fs.copyFileSync(db.dbPath, dest);
    const { status: supabaseStatus } = require('../lib/supabase');
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
