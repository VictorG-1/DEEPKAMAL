const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { status: supabaseStatus } = require('../lib/supabase');

const router = express.Router();

async function snapshot() {
  const counts = {
    users: Number((await db.prepare('SELECT COUNT(*) AS c FROM users').get()).c),
    services: Number((await db.prepare('SELECT COUNT(*) AS c FROM services').get()).c),
    categories: Number((await db.prepare('SELECT COUNT(*) AS c FROM service_categories').get()).c),
    tickets: Number((await db.prepare('SELECT COUNT(*) AS c FROM tickets').get()).c),
    orders: Number((await db.prepare('SELECT COUNT(*) AS c FROM orders').get()).c),
    clients: Number((await db.prepare('SELECT COUNT(*) AS c FROM clients').get()).c),
    attendance: Number((await db.prepare('SELECT COUNT(*) AS c FROM attendance').get()).c),
    people: Number(
      (await db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role IN ('admin','manager','resource')`).get()).c
    ),
    materials: Number((await db.prepare('SELECT COUNT(*) AS c FROM materials').get()).c),
    quotations: Number((await db.prepare('SELECT COUNT(*) AS c FROM quotations').get()).c),
    invoices: Number((await db.prepare('SELECT COUNT(*) AS c FROM invoices').get()).c),
    assets: Number((await db.prepare('SELECT COUNT(*) AS c FROM site_assets').get()).c),
    vendors: Number((await db.prepare('SELECT COUNT(*) AS c FROM vendors').get()).c)
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
