const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/enqueue', requireAuth, async (req, res) => {
  const { action, payload, deviceId } = req.body || {};
  if (!action || !payload) return res.status(400).json({ error: 'action and payload required' });
  const result = await db
    .prepare(
      `INSERT INTO offline_queue (device_id, user_id, action, payload, status)
       VALUES (?, ?, ?, ?, 'Pending')`
    )
    .run(deviceId || null, req.user.id, action, JSON.stringify(payload));
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

router.post('/flush', requireAuth, async (req, res) => {
  const rows = await db
    .prepare(`SELECT * FROM offline_queue WHERE user_id = ? AND status = 'Pending' ORDER BY id`)
    .all(req.user.id);

  const results = [];
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);
      if (row.action === 'attendance') {
        require('./attendance'); // ensure loaded
        // inline minimal apply
        const day = payload.date || new Date().toISOString().slice(0, 10);
        await db.prepare(
          `INSERT INTO attendance (user_id, date, status, site_id)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status`
        ).run(req.user.id, day, payload.status || 'Present', payload.siteId || null);
      } else if (row.action === 'evidence') {
        await db.prepare(
          `INSERT INTO work_evidence (ticket_id, user_id, captured_at, latitude, longitude, notes, photo_path)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          payload.ticketId || null,
          req.user.id,
          payload.capturedAt || new Date().toISOString(),
          payload.latitude ?? null,
          payload.longitude ?? null,
          payload.notes || 'Offline evidence',
          payload.photoPath || null
        );
        if (payload.ticketId && payload.complete) {
          await db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(
            payload.ticketId
          );
        }
      } else if (row.action === 'ticket_status') {
        await db.prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
          payload.status,
          payload.ticketId
        );
      }
      await db.prepare(`UPDATE offline_queue SET status = 'Done', processed_at = datetime('now') WHERE id = ?`).run(row.id);
      results.push({ id: row.id, ok: true });
    } catch (err) {
      await db.prepare(`UPDATE offline_queue SET status = 'Error' WHERE id = ?`).run(row.id);
      results.push({ id: row.id, ok: false, error: err.message });
    }
  }
  res.json({ processed: results.length, results });
});

router.get('/pending', requireAuth, async (req, res) => {
  const rows = await db
    .prepare(`SELECT id, action, status, created_at FROM offline_queue WHERE user_id = ? AND status = 'Pending'`)
    .all(req.user.id);
  res.json({ pending: rows });
});

module.exports = router;
