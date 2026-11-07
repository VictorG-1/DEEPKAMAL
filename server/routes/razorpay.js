const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { loadEnv } = require('../lib/supabase');

const router = express.Router();

function cfg() {
  const env = loadEnv();
  return {
    keyId: env.RAZORPAY_KEY_ID || null,
    keySecret: env.RAZORPAY_KEY_SECRET || null,
    enabled: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
  };
}

router.get('/status', requireAuth, (_req, res) => {
  const c = cfg();
  res.json({
    enabled: c.enabled,
    keyId: c.keyId ? c.keyId.slice(0, 8) + '…' : null,
    mode: c.enabled ? 'live-keys-present' : 'demo',
    note: c.enabled
      ? 'Razorpay keys found — orders can be created against Razorpay API.'
      : 'No RAZORPAY_KEY_ID/SECRET. Demo checkout creates a local pending payment reference.'
  });
});

router.post('/order', requireAuth, (req, res) => {
  const { entityType, entityId, amount } = req.body || {};
  const amt = Number(amount);
  if (!['quotation', 'invoice', 'order'].includes(entityType) || !(amt > 0)) {
    return res.status(400).json({ error: 'entityType and amount required' });
  }
  const c = cfg();
  const receipt = `DK-${entityType}-${entityId}-${Date.now()}`;
  const local = db
    .prepare(
      `INSERT INTO payments (entity_type, entity_id, amount, method, status, reference, notes, created_by)
       VALUES (?, ?, ?, 'Razorpay', 'Pending', ?, ?, ?)`
    )
    .run(entityType, entityId, amt, receipt, c.enabled ? 'Awaiting Razorpay' : 'Demo Razorpay order', req.user.id);

  if (!c.enabled) {
    return res.status(201).json({
      demo: true,
      paymentId: local.lastInsertRowid,
      orderId: `order_demo_${local.lastInsertRowid}`,
      amount: Math.round(amt * 100),
      currency: 'INR',
      keyId: 'rzp_test_demo',
      receipt
    });
  }

  // Real Razorpay REST without SDK dependency
  const auth = Buffer.from(`${c.keyId}:${c.keySecret}`).toString('base64');
  const body = JSON.stringify({
    amount: Math.round(amt * 100),
    currency: 'INR',
    receipt,
    notes: { entityType, entityId: String(entityId) }
  });

  fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body
  })
    .then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.description || 'Razorpay order failed');
      db.prepare(`UPDATE payments SET reference = ? WHERE id = ?`).run(data.id, local.lastInsertRowid);
      res.status(201).json({
        demo: false,
        paymentId: local.lastInsertRowid,
        orderId: data.id,
        amount: data.amount,
        currency: data.currency,
        keyId: c.keyId,
        receipt
      });
    })
    .catch((err) => res.status(502).json({ error: err.message }));
});

router.post('/confirm', requireAuth, (req, res) => {
  const { paymentId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body || {};
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!pay) return res.status(404).json({ error: 'Payment not found' });
  const c = cfg();

  if (c.enabled && razorpaySignature && razorpayOrderId && razorpayPaymentId) {
    const expected = crypto
      .createHmac('sha256', c.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (expected !== razorpaySignature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  db.prepare(`UPDATE payments SET status = 'Paid', reference = COALESCE(?, reference) WHERE id = ?`).run(
    razorpayPaymentId || pay.reference,
    pay.id
  );

  if (pay.entity_type === 'quotation') {
    const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(pay.entity_id);
    if (q) {
      const paid = Math.round((Number(q.amount_paid || 0) + Number(pay.amount)) * 100) / 100;
      db.prepare(`UPDATE quotations SET amount_paid = ? WHERE id = ?`).run(paid, q.id);
    }
  } else if (pay.entity_type === 'invoice') {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(pay.entity_id);
    if (inv) {
      const paid = Math.round((Number(inv.amount_paid || 0) + Number(pay.amount)) * 100) / 100;
      const status = paid >= Number(inv.amount) ? 'Paid' : 'Partial';
      db.prepare(`UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?`).run(paid, status, inv.id);
    }
  } else if (pay.entity_type === 'order') {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(pay.entity_id);
    if (o) {
      const paid = Math.round((Number(o.amount_paid || 0) + Number(pay.amount)) * 100) / 100;
      db.prepare(`UPDATE orders SET amount_paid = ?, payment_status = ? WHERE id = ?`).run(
        paid,
        paid >= Number(o.amount) ? 'Paid' : 'Partial',
        o.id
      );
    }
  }

  res.json({ ok: true, status: 'Paid' });
});

module.exports = router;
