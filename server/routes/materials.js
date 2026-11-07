const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toBarcode, svgBarcode } = require('../lib/barcode');

const router = express.Router();

function mapMaterial(m) {
  return {
    id: m.id,
    sku: m.sku,
    category: m.category,
    name: m.name,
    unit: m.unit,
    rate: m.rate,
    gstPct: m.gst_pct,
    description: m.description,
    colorName: m.color_name,
    colorHex: m.color_hex,
    barcode: m.barcode || toBarcode(m.sku),
    active: !!m.active
  };
}

router.get('/', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const color = String(req.query.color || '').trim();
  let sql = `SELECT * FROM materials WHERE active = 1`;
  const params = [];
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (color) {
    sql += ` AND color_name = ?`;
    params.push(color);
  }
  if (q) {
    sql += ` AND (name LIKE ? OR sku LIKE ? OR category LIKE ? OR description LIKE ? OR barcode LIKE ? OR color_name LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  sql += ` ORDER BY category, sort_order, name`;
  const rows = db.prepare(sql).all(...params);

  const categories = db
    .prepare(`SELECT category, COUNT(*) AS count FROM materials WHERE active = 1 GROUP BY category ORDER BY category`)
    .all()
    .map((c) => ({ name: c.category, count: c.count }));

  const colors = db
    .prepare(
      `SELECT color_name AS name, color_hex AS hex, COUNT(*) AS count
       FROM materials WHERE active = 1 AND color_name IS NOT NULL
       GROUP BY color_name, color_hex ORDER BY count DESC`
    )
    .all();

  res.json({ materials: rows.map(mapMaterial), categories, colors });
});

// Public SVG label endpoints (no JWT — used for print/img tags)
router.get('/barcode/:code', (req, res) => {
  const raw = String(req.params.code || '').replace(/\.svg$/i, '');
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return res.status(400).json({ error: 'code required' });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svgBarcode(code.startsWith('DK') ? code : `DK${code}`));
});

router.get('/:id/barcode', (req, res) => {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Material not found' });
  const code = row.barcode || toBarcode(row.sku);
  if (!row.barcode) db.prepare('UPDATE materials SET barcode = ? WHERE id = ?').run(code, row.id);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svgBarcode(code));
});

router.post('/', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const { sku, category, name, unit, rate, gstPct, description, colorName, colorHex } = req.body || {};
  if (!sku || !category || !name) {
    return res.status(400).json({ error: 'sku, category and name are required' });
  }
  try {
    const barcode = toBarcode(sku);
    const result = db
      .prepare(
        `INSERT INTO materials (sku, category, name, unit, rate, gst_pct, description, color_name, color_hex, barcode, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 9999)`
      )
      .run(
        String(sku).toUpperCase(),
        category,
        name,
        unit || 'Nos',
        Number(rate) || 0,
        gstPct != null ? Number(gstPct) : 18,
        description || null,
        colorName || null,
        colorHex || null,
        barcode
      );
    const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ material: mapMaterial(row) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    throw err;
  }
});

router.patch('/:id', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Material not found' });
  const { name, unit, rate, gstPct, description, active, category, colorName, colorHex } = req.body || {};
  db.prepare(
    `UPDATE materials SET
      name = COALESCE(?, name),
      unit = COALESCE(?, unit),
      rate = COALESCE(?, rate),
      gst_pct = COALESCE(?, gst_pct),
      description = COALESCE(?, description),
      category = COALESCE(?, category),
      color_name = COALESCE(?, color_name),
      color_hex = COALESCE(?, color_hex),
      active = COALESCE(?, active)
     WHERE id = ?`
  ).run(
    name || null,
    unit || null,
    rate != null ? Number(rate) : null,
    gstPct != null ? Number(gstPct) : null,
    description !== undefined ? description : null,
    category || null,
    colorName || null,
    colorHex || null,
    active === undefined ? null : active ? 1 : 0,
    row.id
  );
  res.json({ material: mapMaterial(db.prepare('SELECT * FROM materials WHERE id = ?').get(row.id)) });
});

module.exports = router;
