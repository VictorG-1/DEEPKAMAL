const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function computeForTicket(ticketId) {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) return null;
  const quote = ticket.quotation_id
    ? await db.prepare('SELECT * FROM quotations WHERE id = ?').get(ticket.quotation_id)
    : null;
  const quoted = Number(quote?.amount || 0);

  const materialCost = (await db
    .prepare(
      `SELECT COALESCE(SUM(mv.qty * m.rate), 0) AS c
       FROM inventory_movements mv
       JOIN materials m ON m.id = mv.material_id
       WHERE mv.direction = 'OUT' AND (
         (mv.ref_type = 'quotation' AND mv.ref_id = ?)
         OR (mv.ref_type = 'ticket' AND mv.ref_id = ?)
       )`
    )
    .get(ticket.quotation_id || -1, ticketId)).c;

  let labourCost = 0;
  if (ticket.assigned_user_id) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const labourDays = await db
      .prepare(`SELECT status FROM attendance WHERE user_id = ? AND date >= ? AND date <= ?`)
      .all(ticket.assigned_user_id, startStr, endStr);
    const wage =
      Number((await db.prepare('SELECT daily_wage FROM users WHERE id = ?').get(ticket.assigned_user_id))?.daily_wage) ||
      0;
    for (const d of labourDays) {
      if (d.status === 'Present') labourCost += wage;
      if (d.status === 'Half day') labourCost += wage * 0.5;
    }
  }

  const actual = Number(materialCost) + Number(labourCost);
  const margin = quoted - actual;

  try {
    await db
      .prepare(
        `INSERT INTO job_costs (ticket_id, quotation_id, quoted_amount, material_cost, labour_cost, other_cost, actual_total, margin, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'))
         ON CONFLICT(ticket_id) DO UPDATE SET
           quoted_amount = excluded.quoted_amount,
           material_cost = excluded.material_cost,
           labour_cost = excluded.labour_cost,
           actual_total = excluded.actual_total,
           margin = excluded.margin,
           updated_at = datetime('now')`
      )
      .run(ticketId, ticket.quotation_id || null, quoted, materialCost, labourCost, actual, margin);
  } catch (_) {
    await db.prepare(`DELETE FROM job_costs WHERE ticket_id = ?`).run(ticketId);
    await db
      .prepare(
        `INSERT INTO job_costs (ticket_id, quotation_id, quoted_amount, material_cost, labour_cost, other_cost, actual_total, margin, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'))`
      )
      .run(ticketId, ticket.quotation_id || null, quoted, materialCost, labourCost, actual, margin);
  }

  return {
    ticketId,
    code: ticket.code,
    title: ticket.title,
    quotedAmount: quoted,
    materialCost: Math.round(Number(materialCost) * 100) / 100,
    labourCost: Math.round(Number(labourCost) * 100) / 100,
    actualTotal: Math.round(Number(actual) * 100) / 100,
    margin: Math.round(Number(margin) * 100) / 100,
    marginPct: quoted ? Math.round((margin / quoted) * 1000) / 10 : null
  };
}

// Ensure unique ticket_id for upsert — add table fix if needed
router.get('/', requireAuth, requireRole('admin', 'manager'), async (_req, res) => {
  try {
    const tickets = await db
      .prepare(
        `SELECT id FROM tickets WHERE status IN ('Resolved','Closed','In progress','On the way','Assigned') ORDER BY id DESC LIMIT 40`
      )
      .all();
    const rows = [];
    for (const t of tickets) {
      try {
        const row = await computeForTicket(t.id);
        if (row) rows.push(row);
      } catch (err) {
        console.warn('costing skip ticket', t.id, err.message || err);
      }
    }
    res.json({ costs: rows });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Costing failed' });
  }
});

router.get('/:ticketId', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const row = await computeForTicket(Number(req.params.ticketId));
  if (!row) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ cost: row });
});

module.exports = router;
module.exports.computeForTicket = computeForTicket;
