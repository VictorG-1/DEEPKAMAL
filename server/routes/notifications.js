const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { queueNotification } = require('../lib/notify');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const rows = db
    .prepare(`SELECT * FROM notifications ORDER BY id DESC LIMIT 80`)
    .all()
    .map((n) => ({
      id: n.id,
      channel: n.channel,
      recipient: n.recipient,
      subject: n.subject,
      body: n.body,
      link: n.link,
      status: n.status,
      entityType: n.entity_type,
      entityId: n.entity_id,
      createdAt: n.created_at
    }));
  res.json({ notifications: rows });
});

router.post('/send', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const { channel, recipient, subject, body } = req.body || {};
  if (!channel || !body) return res.status(400).json({ error: 'channel and body required' });
  const result = queueNotification({ channel, recipient, subject, body });
  res.status(201).json(result);
});

/** Queue payment reminders for unpaid / partial invoices */
router.post('/reminders/payments', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const { notifyPaymentReminder } = require('../lib/notify');
  const rows = db
    .prepare(
      `SELECT i.*, c.name AS client_name, c.phone, c.email FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.status IN ('Unpaid','Partial')`
    )
    .all();
  let created = 0;
  for (const inv of rows) {
    const n = notifyPaymentReminder(inv, { phone: inv.phone, email: inv.email, name: inv.client_name });
    created += n.length;
  }
  res.json({ ok: true, invoices: rows.length, notifications: created });
});

/** Queue AMC reminders for clients expiring in 45 days */
router.post('/reminders/amc', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const { notifyAmcReminder } = require('../lib/notify');
  const clients = db
    .prepare(
      `SELECT * FROM clients WHERE amc_expires IS NOT NULL AND date(amc_expires) <= date('now', '+45 day')`
    )
    .all();
  let created = 0;
  for (const c of clients) {
    created += notifyAmcReminder(c, c.amc_expires).length;
  }
  res.json({ ok: true, clients: clients.length, notifications: created });
});

module.exports = router;
