const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, (req, res) => {
  const { rating, comment, recommend, ticketCode, orderId } = req.body || {};
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'A star rating from 1 to 5 is required' });
  }

  const result = db.prepare(`
    INSERT INTO feedback (ticket_code, order_id, customer_user_id, rating, comment, recommend)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    ticketCode || null,
    orderId || null,
    req.user.id,
    rating,
    comment || null,
    recommend || null
  );

  res.status(201).json({
    feedback: {
      id: result.lastInsertRowid,
      rating,
      comment,
      recommend
    }
  });
});

router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM feedback WHERE customer_user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  const avg = rows.length
    ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1)
    : null;
  res.json({ feedback: rows, average: avg });
});

router.get('/', requireAuth, requireRoleSafe, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, u.name AS customer_name FROM feedback f
       LEFT JOIN users u ON u.id = f.customer_user_id
       ORDER BY f.created_at DESC LIMIT 50`
    )
    .all()
    .map((f) => ({
      id: f.id,
      rating: f.rating,
      comment: f.comment,
      recommend: f.recommend,
      ticketCode: f.ticket_code,
      customerName: f.customer_name,
      createdAt: f.created_at
    }));
  const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : null;
  res.json({ feedback: rows, average: avg });
});

function requireRoleSafe(req, res, next) {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  next();
}

module.exports = router;
