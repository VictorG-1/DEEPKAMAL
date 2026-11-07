const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { queueNotification } = require('../lib/notify');

const router = express.Router();

function nextInvoiceCode(prefix = 'INV') {
  const row = db.prepare(`SELECT code FROM invoices WHERE code LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}-%`);
  const n = row ? parseInt(String(row.code).replace(/\D/g, ''), 10) + 1 : 1001;
  return `${prefix}-${n}`;
}

function mapInvoice(inv, withItems = false) {
  const balance = Math.round(Math.max(0, Number(inv.amount) - Number(inv.amount_paid || 0)) * 100) / 100;
  const base = {
    id: inv.id,
    code: inv.code,
    clientId: inv.client_id,
    client: inv.client_name || '—',
    quotationId: inv.quotation_id,
    orderId: inv.order_id,
    invoiceDate: inv.invoice_date,
    dueDate: inv.due_date,
    subtotal: inv.subtotal,
    taxAmount: inv.tax_amount,
    amount: inv.amount,
    amountPaid: inv.amount_paid || 0,
    balance,
    status: inv.status,
    notes: inv.notes,
    createdAt: inv.created_at,
    agingDays: inv.due_date
      ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000))
      : 0
  };
  if (withItems) {
    base.items = db
      .prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id`)
      .all(inv.id)
      .map((i) => ({
        id: i.id,
        description: i.description,
        hsn: i.hsn,
        qty: i.qty,
        unit: i.unit,
        rate: i.rate,
        gstPct: i.gst_pct,
        taxAmount: i.tax_amount,
        amount: i.amount
      }));
  }
  return base;
}

const select = `
  SELECT i.*, c.name AS client_name
  FROM invoices i
  LEFT JOIN clients c ON c.id = i.client_id
`;

router.get('/', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'customer') {
    const user = db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    rows = db.prepare(`${select} WHERE i.client_id = ? ORDER BY i.id DESC`).all(user?.client_id || -1);
  } else {
    rows = db.prepare(`${select} ORDER BY i.id DESC`).all();
  }
  const invoices = rows.map((r) => mapInvoice(r));
  const receivables = invoices
    .filter((i) => ['Unpaid', 'Partial'].includes(i.status))
    .reduce((s, i) => s + i.balance, 0);
  res.json({ invoices, receivables: Math.round(receivables * 100) / 100 });
});

router.get('/:id', requireAuth, (req, res) => {
  const inv = db.prepare(`${select} WHERE i.id = ?`).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice: mapInvoice(inv, true) });
});

router.post('/from-quotation/:quoteId', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const quote = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.quoteId);
  if (!quote) return res.status(404).json({ error: 'Quotation not found' });
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(quote.id);
  const code = nextInvoiceCode('INV');
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 15);

  const id = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO invoices (code, client_id, quotation_id, invoice_date, due_date, subtotal, tax_amount, amount, amount_paid, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        quote.client_id,
        quote.id,
        today,
        due.toISOString().slice(0, 10),
        quote.subtotal || quote.amount,
        quote.tax_amount || 0,
        quote.amount,
        quote.amount_paid || 0,
        Number(quote.amount_paid || 0) >= Number(quote.amount)
          ? 'Paid'
          : Number(quote.amount_paid || 0) > 0
            ? 'Partial'
            : 'Unpaid',
        `Tax invoice from ${quote.code}`,
        req.user.id
      );
    const invId = result.lastInsertRowid;
    const ins = db.prepare(
      `INSERT INTO invoice_items (invoice_id, description, hsn, qty, unit, rate, gst_pct, tax_amount, amount, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    items.forEach((it, idx) => {
      ins.run(invId, it.description, it.hsn, it.qty, it.unit, it.rate, it.gst_pct, it.tax_amount, it.amount, idx);
    });
    return invId;
  })();

  const inv = db.prepare(`${select} WHERE i.id = ?`).get(id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(quote.client_id);
  if (client?.phone || client?.email) {
    queueNotification({
      channel: client.phone ? 'whatsapp' : 'email',
      recipient: client.phone || client.email,
      subject: `Invoice ${code}`,
      body: `Tax invoice ${code} for ₹${Number(quote.amount).toLocaleString('en-IN')} · due ${inv.due_date}`,
      entityType: 'invoice',
      entityId: id
    });
  }
  res.status(201).json({ invoice: mapInvoice(inv, true) });
});

router.post('/:id/credit-note', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const amount = Number(req.body?.amount != null ? req.body.amount : inv.amount);
  const code = nextInvoiceCode('CN');
  const result = db
    .prepare(
      `INSERT INTO invoices (code, client_id, quotation_id, invoice_date, due_date, subtotal, tax_amount, amount, amount_paid, status, notes, created_by)
       VALUES (?, ?, ?, date('now'), date('now'), ?, ?, ?, ?, 'CreditNote', ?, ?)`
    )
    .run(
      code,
      inv.client_id,
      inv.quotation_id,
      -Math.abs(amount),
      0,
      -Math.abs(amount),
      0,
      `Credit note against ${inv.code}`,
      req.user.id
    );
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, description, qty, unit, rate, amount, sort_order)
     VALUES (?, ?, 1, 'Lot', ?, ?, 0)`
  ).run(result.lastInsertRowid, `Credit against ${inv.code}`, -Math.abs(amount), -Math.abs(amount));
  res.status(201).json({ invoice: mapInvoice(db.prepare(`${select} WHERE i.id = ?`).get(result.lastInsertRowid), true) });
});

router.post('/:id/pay', requireAuth, requireRole('admin', 'manager', 'customer'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (req.user.role === 'customer') {
    const user = db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    if (inv.client_id !== user?.client_id) return res.status(403).json({ error: 'Not allowed' });
  }
  const amount = Number(req.body?.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'amount required' });
  const paid = Math.round((Number(inv.amount_paid || 0) + amount) * 100) / 100;
  const status = paid >= Number(inv.amount) ? 'Paid' : 'Partial';
  db.prepare(`UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?`).run(paid, status, inv.id);
  db.prepare(
    `INSERT INTO payments (entity_type, entity_id, amount, method, status, reference, created_by)
     VALUES ('invoice', ?, ?, ?, 'Paid', ?, ?)`
  ).run(inv.id, amount, req.body?.method || 'UPI', req.body?.reference || null, req.user.id);
  res.json({ ok: true, amountPaid: paid, status, balance: Math.max(0, Number(inv.amount) - paid) });
});

module.exports = router;
