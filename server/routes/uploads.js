const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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
        await db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(ticketId);
        const t = await db.prepare('SELECT assigned_user_id FROM tickets WHERE id = ?').get(ticketId);
        if (t?.assigned_user_id) {
          await db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ?`).run(t.assigned_user_id);
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
