const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { moveStock, ensureStockRow, getStock } = require('../lib/inventory');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows;
  if (q) {
    rows = await db
      .prepare(
        `SELECT m.*, COALESCE(s.qty, 0) AS stock_qty
         FROM materials m
         LEFT JOIN inventory_stock s ON s.material_id = m.id
         WHERE m.active = 1 AND (m.name LIKE ? OR m.sku LIKE ? OR m.barcode LIKE ?)
         ORDER BY m.category, m.name`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = await db
      .prepare(
        `SELECT m.*, COALESCE(s.qty, 0) AS stock_qty
         FROM materials m
         LEFT JOIN inventory_stock s ON s.material_id = m.id
         WHERE m.active = 1
         ORDER BY m.category, m.name`
      )
      .all();
  }

  const mapped = rows.map((m) => ({
    id: m.id,
    sku: m.sku,
    name: m.name,
    category: m.category,
    unit: m.unit,
    rate: m.rate,
    colorName: m.color_name,
    colorHex: m.color_hex,
    barcode: m.barcode,
    qty: m.stock_qty,
    reorderLevel: m.reorder_level != null ? m.reorder_level : 50
  }));
  const low = mapped.filter((r) => Number(r.qty) <= Number(r.reorderLevel)).length;
  res.json({
    stock: mapped,
    lowStock: low,
    totalSkus: rows.length
  });
});

router.get('/movements', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const rows = (await db
    .prepare(
      `SELECT mv.*, m.name AS material_name, m.sku, s.name AS site_name, u.name AS user_name
       FROM inventory_movements mv
       LEFT JOIN materials m ON m.id = mv.material_id
       LEFT JOIN sites s ON s.id = mv.site_id
       LEFT JOIN users u ON u.id = mv.user_id
       ORDER BY mv.id DESC LIMIT 100`
    )
    .all())
    .map((r) => ({
      id: r.id,
      material: r.material_name,
      sku: r.sku,
      site: r.site_name,
      qty: r.qty,
      direction: r.direction,
      refType: r.ref_type,
      refId: r.ref_id,
      notes: r.notes,
      user: r.user_name,
      createdAt: r.created_at
    }));
  res.json({ movements: rows });
});

router.post('/receive', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { materialId, qty, notes } = req.body || {};
    await ensureStockRow(materialId);
    const result = await moveStock({
      materialId: Number(materialId),
      qty: Number(qty),
      direction: 'IN',
      notes: notes || 'Stock received',
      userId: req.user.id,
      refType: 'receive'
    });
    res.status(201).json({ ok: true, qty: result.qty });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/issue', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { materialId, qty, siteId, notes } = req.body || {};
    const result = await moveStock({
      materialId: Number(materialId),
      qty: Number(qty),
      direction: 'OUT',
      siteId: siteId ? Number(siteId) : null,
      notes: notes || 'Issued to site',
      userId: req.user.id,
      refType: 'issue'
    });
    res.status(201).json({ ok: true, qty: result.qty, remaining: await getStock(Number(materialId)) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
