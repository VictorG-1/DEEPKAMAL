const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin', 'manager'), async (_req, res) => {
  const rows = (await db
    .prepare(`SELECT * FROM payments ORDER BY id DESC LIMIT 100`)
    .all())
    .map((p) => ({
      id: p.id,
      entityType: p.entity_type,
      entityId: p.entity_id,
      amount: p.amount,
      method: p.method,
      status: p.status,
      reference: p.reference,
      notes: p.notes,
      createdAt: p.created_at
    }));
  res.json({ payments: rows });
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId, amount, method, reference, notes } = req.body || {};
    if (!['quotation', 'order'].includes(entityType)) {
      return res.status(400).json({ error: 'entityType must be quotation or order' });
    }
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ error: 'amount must be > 0' });

    if (entityType === 'quotation') {
      const quote = await db.prepare('SELECT * FROM quotations WHERE id = ?').get(entityId);
      if (!quote) return res.status(404).json({ error: 'Quotation not found' });
      if (req.user.role === 'customer') {
        const user = await db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
        if (quote.client_id !== user?.client_id) return res.status(403).json({ error: 'Not allowed' });
      } else if (!['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Not allowed' });
      }

      const paid = Math.round((Number(quote.amount_paid || 0) + amt) * 100) / 100;
      const result = await db
        .prepare(
          `INSERT INTO payments (entity_type, entity_id, amount, method, status, reference, notes, created_by)
           VALUES ('quotation', ?, ?, ?, 'Paid', ?, ?, ?)`
        )
        .run(quote.id, amt, method || 'UPI', reference || null, notes || null, req.user.id);
      await db.prepare(`UPDATE quotations SET amount_paid = ?, updated_at = datetime('now') WHERE id = ?`).run(paid, quote.id);
      await db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'payment', ?)`)
        .run(req.user.id, `${req.user.name} recorded ₹${amt} on ${quote.code}`, result.lastInsertRowid);

      return res.status(201).json({
        ok: true,
        paymentId: result.lastInsertRowid,
        amountPaid: paid,
        balance: Math.max(0, Math.round((Number(quote.amount) - paid) * 100) / 100)
      });
    }

    // order
    if (!['admin', 'manager', 'customer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(entityId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role === 'customer' && order.customer_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const paid = Math.round((Number(order.amount_paid || 0) + amt) * 100) / 100;
    const paymentStatus = paid >= Number(order.amount) ? 'Paid' : 'Partial';
    const result = await db
      .prepare(
        `INSERT INTO payments (entity_type, entity_id, amount, method, status, reference, notes, created_by)
         VALUES ('order', ?, ?, ?, 'Paid', ?, ?, ?)`
      )
      .run(order.id, amt, method || 'UPI', reference || null, notes || null, req.user.id);
    await db.prepare(`UPDATE orders SET amount_paid = ?, payment_status = ? WHERE id = ?`).run(paid, paymentStatus, order.id);

    res.status(201).json({
      ok: true,
      paymentId: result.lastInsertRowid,
      amountPaid: paid,
      paymentStatus,
      balance: Math.max(0, Math.round((Number(order.amount) - paid) * 100) / 100)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
