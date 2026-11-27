const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/charts', requireAuth, requireRole('admin', 'manager'), async (_req, res) => {
  const ticketStatus = await db
    .prepare(`SELECT status, COUNT(*) AS c FROM tickets GROUP BY status ORDER BY c DESC`)
    .all();

  const ordersPay = await db
    .prepare(`SELECT payment_status AS status, COUNT(*) AS c, COALESCE(SUM(amount),0) AS amount FROM orders GROUP BY payment_status`)
    .all();

  const claims = await db
    .prepare(`SELECT status, COUNT(*) AS c, COALESCE(SUM(COALESCE(net_amount, amount)),0) AS amount FROM salary_claims GROUP BY status`)
    .all();

  const revenueMonth = await db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS paid
       FROM payments
       WHERE status = 'Paid' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    )
    .get();

  const ticketCost = await db
    .prepare(
      `SELECT
         COALESCE(SUM(sale_value),0) AS sale,
         COALESCE(SUM(purchase_value),0) AS purchase,
         COALESCE(SUM(labour_cost),0) AS labour,
         COALESCE(SUM(material_cost),0) AS material
       FROM tickets
       WHERE status IN ('Resolved','Closed')`
    )
    .get();

  const dailyTickets = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c
       FROM tickets
       WHERE date(created_at) >= date('now', '-13 day')
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day`
    )
    .all();

  const partnerWages = await db
    .prepare(
      `SELECT name, wage_balance AS balance, retained_balance AS retained, engagement_type AS engagement, payment_locked AS locked
       FROM users WHERE role = 'resource' ORDER BY wage_balance DESC LIMIT 12`
    )
    .all();

  res.json({
    ticketStatus: ticketStatus.map((r) => ({ label: r.status, value: Number(r.c) })),
    orderPayments: ordersPay.map((r) => ({ label: r.status || '—', value: Number(r.c), amount: Number(r.amount) })),
    claims: claims.map((r) => ({ label: r.status, value: Number(r.c), amount: Number(r.amount) })),
    revenueThisMonth: Number(revenueMonth?.paid || 0),
    jobEconomics: {
      sale: Number(ticketCost?.sale || 0),
      purchase: Number(ticketCost?.purchase || 0),
      labour: Number(ticketCost?.labour || 0),
      material: Number(ticketCost?.material || 0),
      margin:
        Number(ticketCost?.sale || 0) -
        Number(ticketCost?.purchase || 0) -
        Number(ticketCost?.labour || 0) -
        Number(ticketCost?.material || 0)
    },
    ticketsLast14Days: dailyTickets.map((r) => ({ label: r.day, value: Number(r.c) })),
    partnerWages: partnerWages.map((p) => ({
      name: p.name,
      balance: Number(p.balance || 0),
      retained: Number(p.retained || 0),
      engagement: p.engagement || 'daily_wage',
      locked: Boolean(p.locked)
    }))
  });
});

module.exports = router;
