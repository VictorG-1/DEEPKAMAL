const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadsDir: resolveUploadsDir } = require('../lib/paths');

const router = express.Router();
const uploadsDir = resolveUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only images allowed'));
    cb(null, true);
  }
});

router.post(
  '/evidence',
  requireAuth,
  requireRole('admin', 'manager', 'resource'),
  upload.single('photo'),
  async (req, res) => {
    try {
      const ticketId = req.body.ticketId ? Number(req.body.ticketId) : null;
      const siteWorkId = req.body.siteWorkId ? Number(req.body.siteWorkId) : null;
      const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
      const result = await db
        .prepare(
          `INSERT INTO work_evidence (site_work_id, ticket_id, user_id, captured_at, latitude, longitude, notes, photo_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          siteWorkId,
          ticketId,
          req.user.id,
          req.body.capturedAt || new Date().toISOString(),
          req.body.latitude != null && req.body.latitude !== '' ? Number(req.body.latitude) : null,
          req.body.longitude != null && req.body.longitude !== '' ? Number(req.body.longitude) : null,
          req.body.notes || 'Site evidence',
          photoPath
        );

      if (ticketId && String(req.body.complete) === 'true') {
        const t = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
        if (!t?.complete_verified_at) {
          return res.status(400).json({
            error: 'Customer completion OTP required before closing the job',
            needsCompleteOtp: true,
            evidenceId: result.lastInsertRowid,
            photoPath
          });
        }
        await db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(ticketId);
        if (t?.assigned_user_id) {
          await db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ?`).run(t.assigned_user_id);
        }
        if (t?.order_id) {
          const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(t.order_id);
          if (order) {
            const balance = Math.max(0, Number(order.amount) - Number(order.amount_paid || 0));
            await db
              .prepare(
                `UPDATE orders SET balance_due = ?, payment_status = ?, status = 'COMPLETED' WHERE id = ?`
              )
              .run(balance, balance > 0 ? 'BalanceDue' : 'Paid', order.id);
          }
        }
      }

      await db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'evidence', ?)`)
        .run(req.user.id, `${req.user.name} uploaded site evidence`, result.lastInsertRowid);

      res.status(201).json({ ok: true, id: result.lastInsertRowid, photoPath });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
