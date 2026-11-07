const db = require('../db');

async function getStock(materialId) {
  const row = await db.prepare('SELECT qty FROM inventory_stock WHERE material_id = ?').get(materialId);
  return row ? Number(row.qty) : 0;
}

async function ensureStockRow(materialId) {
  await db.prepare(
    `INSERT INTO inventory_stock (material_id, qty, updated_at) VALUES (?, 0, datetime('now'))
     ON CONFLICT(material_id) DO NOTHING`
  ).run(materialId);
}

async function moveStock({ materialId, qty, direction, siteId = null, refType = null, refId = null, notes = null, userId = null }) {
  const amount = Math.abs(Number(qty) || 0);
  if (!materialId || !(amount > 0)) throw Object.assign(new Error('materialId and qty required'), { status: 400 });
  if (!['IN', 'OUT'].includes(direction)) throw Object.assign(new Error('direction must be IN or OUT'), { status: 400 });

  await ensureStockRow(materialId);
  const current = await getStock(materialId);
  if (direction === 'OUT' && current < amount) {
    throw Object.assign(new Error(`Insufficient stock for material #${materialId} (have ${current}, need ${amount})`), {
      status: 400
    });
  }

  const next = direction === 'IN' ? current + amount : current - amount;
  await db.prepare(`UPDATE inventory_stock SET qty = ?, updated_at = datetime('now') WHERE material_id = ?`).run(next, materialId);
  const mov = await db
    .prepare(
      `INSERT INTO inventory_movements (material_id, site_id, qty, direction, ref_type, ref_id, notes, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(materialId, siteId, amount, direction, refType, refId, notes, userId);

  if (siteId && direction === 'OUT') {
    const value = await db.prepare('SELECT rate FROM materials WHERE id = ?').get(materialId);
    const add = amount * Number(value?.rate || 0);
    await db.prepare(`UPDATE sites SET used_material = COALESCE(used_material, 0) + ? WHERE id = ?`).run(add, siteId);
  }

  return { movementId: mov.lastInsertRowid, qty: next };
}

async function seedInitialStock(defaultQty = 500) {
  const have = Number((await db.prepare('SELECT COUNT(*) AS c FROM inventory_stock').get()).c);
  if (have > 50) return;
  const mats = await db.prepare('SELECT id FROM materials WHERE active = 1').all();
  const upsert = db.prepare(
    `INSERT INTO inventory_stock (material_id, qty, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(material_id) DO NOTHING`
  );
  await db.transaction(async () => {
    for (const m of mats) await upsert.run(m.id, defaultQty);
  });
}

module.exports = { getStock, ensureStockRow, moveStock, seedInitialStock };
