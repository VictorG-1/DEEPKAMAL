const db = require('../db');
const { moveStock } = require('./inventory');

async function nextTicketCode() {
  const row = await db
    .prepare(`SELECT MAX(CAST(REPLACE(code, 'DK-', '') AS INTEGER)) AS n FROM tickets WHERE code GLOB 'DK-[0-9]*'`)
    .get();
  return `DK-${(row?.n || 2900) + 1}`;
}

/** Convert approved quotation → ticket + site work + material issue */
async function convertQuotationToJob(quoteId, user) {
  const quote = await db.prepare('SELECT * FROM quotations WHERE id = ?').get(quoteId);
  if (!quote) throw Object.assign(new Error('Quotation not found'), { status: 404 });
  if (quote.status !== 'Approved') throw Object.assign(new Error('Only approved quotations can convert'), { status: 400 });
  if (quote.ticket_id) {
    return { ticketId: quote.ticket_id, alreadyConverted: true };
  }

  const items = await db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id').all(quoteId);
  let siteId = quote.site_id;
  if (!siteId && quote.client_id) {
    const site = await db.prepare('SELECT id FROM sites WHERE client_id = ? ORDER BY id LIMIT 1').get(quote.client_id);
    siteId = site?.id || null;
    if (!siteId) {
      siteId = (await db
        .prepare(`INSERT INTO sites (client_id, name, address, city) VALUES (?, ?, ?, ?)`)
        .run(quote.client_id, 'Main site', quote.site_address || null, quote.place_of_supply || null)).lastInsertRowid;
    }
  }

  const boqText = items
    .map((i) => `• ${i.description} — ${i.qty} ${i.unit} @ ₹${i.rate}`)
    .join('\n');
  const code = await nextTicketCode();
  const title = `Job from ${quote.code}: ${quote.title || quote.scope}`;
  const ticketId = (await db
    .prepare(
      `INSERT INTO tickets (code, title, description, client_id, site_id, priority, status, created_by, quotation_id, updated_at)
       VALUES (?, ?, ?, ?, ?, 'High', 'Unassigned', ?, ?, datetime('now'))`
    )
    .run(code, title, boqText || quote.scope, quote.client_id, siteId, user.id, quote.id)).lastInsertRowid;

  const workId = (await db
    .prepare(
      `INSERT INTO site_works (title, client_id, site_id, team, progress, due_date, status)
       VALUES (?, ?, ?, 'Dispatch queue', 0, date('now', '+14 day'), 'ACTIVE')`
    )
    .run(title, quote.client_id, siteId)).lastInsertRowid;

  const planned = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  if (siteId) {
    await db.prepare(`UPDATE sites SET planned_material = COALESCE(planned_material, 0) + ? WHERE id = ?`).run(planned, siteId);
  }

  const issued = [];
  for (const item of items) {
    if (!item.material_id) continue;
    if (/labour/i.test(item.category || '')) continue;
    try {
      const result = await moveStock({
        materialId: item.material_id,
        qty: item.qty,
        direction: 'OUT',
        siteId,
        refType: 'quotation',
        refId: quote.id,
        notes: `Issued for ${quote.code} / ${code}`,
        userId: user.id
      });
      issued.push({ materialId: item.material_id, qty: item.qty, stock: result.qty });
    } catch (err) {
      // Soft-fail stock: still convert job; note shortage
      issued.push({ materialId: item.material_id, qty: item.qty, error: err.message });
    }
  }

  await db.prepare(`UPDATE quotations SET ticket_id = ?, converted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .run(ticketId, quote.id);
  await db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'quotation', ?)`)
    .run(user.id, `${user.name} converted ${quote.code} → ticket ${code}`, quote.id);

  return { ticketId, ticketCode: code, workId, siteId, issued, alreadyConverted: false };
}

module.exports = { convertQuotationToJob };
