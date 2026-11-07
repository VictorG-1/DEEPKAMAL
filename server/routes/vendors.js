const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { moveStock } = require('../lib/inventory');

const router = express.Router();

function nextPoCode() {
  const row = db.prepare(`SELECT code FROM purchase_orders ORDER BY id DESC LIMIT 1`).get();
  const n = row ? parseInt(String(row.code).replace(/\D/g, ''), 10) + 1 : 5001;
  return `PO-${n}`;
}

router.get('/', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const vendors = db
    .prepare('SELECT * FROM vendors ORDER BY name')
    .all()
    .map((v) => ({
      id: v.id,
      name: v.name,
      phone: v.phone,
      email: v.email,
      gstin: v.gstin,
      address: v.address
    }));
  res.json({ vendors });
});

router.post('/', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const { name, phone, email, gstin, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db
    .prepare(`INSERT INTO vendors (name, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?)`)
    .run(name, phone || null, email || null, gstin || null, address || null);
  res.status(201).json({ vendor: { id: result.lastInsertRowid, name, phone, email, gstin, address } });
});

router.get('/orders', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const orders = db
    .prepare(
      `SELECT p.*, v.name AS vendor_name FROM purchase_orders p
       LEFT JOIN vendors v ON v.id = p.vendor_id
       ORDER BY p.id DESC`
    )
    .all()
    .map((p) => ({
      id: p.id,
      code: p.code,
      vendor: p.vendor_name,
      vendorId: p.vendor_id,
      status: p.status,
      total: p.total,
      notes: p.notes,
      createdAt: p.created_at,
      items: db
        .prepare(`SELECT * FROM purchase_order_items WHERE po_id = ?`)
        .all(p.id)
        .map((i) => ({
          id: i.id,
          materialId: i.material_id,
          description: i.description,
          qty: i.qty,
          receivedQty: i.received_qty,
          rate: i.rate,
          amount: i.amount
        }))
    }));
  res.json({ orders });
});

router.post('/orders', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const { vendorId, notes, items } = req.body || {};
  if (!vendorId || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'vendorId and items required' });
  }
  const code = nextPoCode();
  const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.rate || 0), 0);
  const poId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO purchase_orders (code, vendor_id, status, notes, total, created_by)
         VALUES (?, ?, 'Open', ?, ?, ?)`
      )
      .run(code, vendorId, notes || null, total, req.user.id);
    const id = result.lastInsertRowid;
    const ins = db.prepare(
      `INSERT INTO purchase_order_items (po_id, material_id, description, qty, rate, amount)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const it of items) {
      const mat = it.materialId ? db.prepare('SELECT * FROM materials WHERE id = ?').get(it.materialId) : null;
      const qty = Number(it.qty);
      const rate = Number(it.rate != null ? it.rate : mat?.rate || 0);
      ins.run(id, mat?.id || null, it.description || mat?.name || 'Item', qty, rate, qty * rate);
    }
    return id;
  })();
  res.status(201).json({ ok: true, id: poId, code });
});

/** GRN — receive against PO line */
router.post('/orders/:id/receive', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'PO not found' });
  const lines = req.body?.items;
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: 'items [{id, qty}] required' });
  }

  try {
    db.transaction(() => {
      for (const line of lines) {
        const item = db.prepare('SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ?').get(line.id, po.id);
        if (!item) throw Object.assign(new Error(`PO line ${line.id} not found`), { status: 400 });
        const qty = Number(line.qty);
        if (!(qty > 0)) continue;
        const received = Number(item.received_qty || 0) + qty;
        if (received > Number(item.qty) + 0.0001) {
          throw Object.assign(new Error(`Over-receive on ${item.description}`), { status: 400 });
        }
        db.prepare(`UPDATE purchase_order_items SET received_qty = ? WHERE id = ?`).run(received, item.id);
        if (item.material_id) {
          moveStock({
            materialId: item.material_id,
            qty,
            direction: 'IN',
            refType: 'po',
            refId: po.id,
            notes: `GRN ${po.code}`,
            userId: req.user.id
          });
        }
      }
      const open = db
        .prepare(`SELECT COUNT(*) AS c FROM purchase_order_items WHERE po_id = ? AND received_qty < qty`)
        .get(po.id).c;
      db.prepare(`UPDATE purchase_orders SET status = ? WHERE id = ?`).run(open ? 'Partial' : 'Received', po.id);
    })();
    res.json({ ok: true, status: db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(po.id).status });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Suggest POs for below-reorder materials */
router.get('/reorder-suggestions', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT m.id, m.sku, m.name, m.unit, m.rate, m.reorder_level,
              COALESCE(s.qty, 0) AS qty
       FROM materials m
       LEFT JOIN inventory_stock s ON s.material_id = m.id
       WHERE m.active = 1 AND COALESCE(s.qty, 0) <= COALESCE(m.reorder_level, 50)
       ORDER BY (COALESCE(m.reorder_level, 50) - COALESCE(s.qty, 0)) DESC
       LIMIT 40`
    )
    .all()
    .map((r) => ({
      materialId: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      rate: r.rate,
      qty: r.qty,
      reorderLevel: r.reorder_level || 50,
      suggestQty: Math.max(50, (r.reorder_level || 50) * 2 - r.qty)
    }));
  res.json({ suggestions: rows });
});

module.exports = router;
