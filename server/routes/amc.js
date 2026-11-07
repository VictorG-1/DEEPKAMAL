const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { queueNotification } = require('../lib/notify');

const router = express.Router();

async function nextTicketCode() {
  const row = await db
    .prepare(`SELECT MAX(CAST(REPLACE(code, 'DK-', '') AS INTEGER)) AS n FROM tickets WHERE code GLOB 'DK-[0-9]*'`)
    .get();
  return `DK-${(row?.n || 2900) + 1}`;
}

router.get('/visits', requireAuth, requireRole('admin', 'manager'), async (_req, res) => {
  const visits = (await db
    .prepare(
      `SELECT v.*, c.name AS client_name, s.name AS site_name, t.code AS ticket_code
       FROM amc_visits v
       LEFT JOIN clients c ON c.id = v.client_id
       LEFT JOIN sites s ON s.id = v.site_id
       LEFT JOIN tickets t ON t.id = v.ticket_id
       ORDER BY v.due_date`
    )
    .all())
    .map((v) => ({
      id: v.id,
      clientId: v.client_id,
      client: v.client_name,
      site: v.site_name,
      title: v.title,
      visitType: v.visit_type,
      dueDate: v.due_date,
      status: v.status,
      ticketId: v.ticket_id,
      ticketCode: v.ticket_code,
      notes: v.notes
    }));
  res.json({ visits });
});

/** Create / refresh preventive visits for AMC clients expiring or due in 45 days */
router.post('/generate', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const clients = await db
    .prepare(
      `SELECT * FROM clients WHERE amc_expires IS NOT NULL AND date(amc_expires) <= date('now', '+45 day')`
    )
    .all();
  const dueAssets = await db
    .prepare(
      `SELECT a.*, c.name AS client_name, c.phone, c.email FROM site_assets a
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.status = 'Active' AND (
         date(a.next_service_due) <= date('now', '+30 day')
         OR date(a.next_refill_due) <= date('now', '+30 day')
         OR date(a.next_hydro_due) <= date('now', '+30 day')
       )`
    )
    .all();
  let created = 0;
  await db.transaction(async () => {
    for (const c of clients) {
      const site = await db.prepare('SELECT id FROM sites WHERE client_id = ? ORDER BY id LIMIT 1').get(c.id);
      const due = c.amc_expires;
      const exists = await db
        .prepare(
          `SELECT id FROM amc_visits WHERE client_id = ? AND due_date = ? AND status IN ('Scheduled','Ticketed')`
        )
        .get(c.id, due);
      if (exists) continue;
      await db.prepare(
        `INSERT INTO amc_visits (client_id, site_id, title, visit_type, due_date, status, notes)
         VALUES (?, ?, ?, 'Preventive', ?, 'Scheduled', ?)`
      ).run(
        c.id,
        site?.id || null,
        `AMC preventive visit · ${c.name}`,
        due,
        `Auto from AMC expiry ${due}`
      );
      created += 1;
      if (c.phone || c.email) {
        queueNotification({
          channel: c.phone ? 'whatsapp' : 'email',
          recipient: c.phone || c.email,
          subject: `AMC visit due · ${c.name}`,
          body: `Preventive AMC visit scheduled around ${due}. DeepKamal will dispatch a technician.`,
          entityType: 'client',
          entityId: c.id
        });
      }
    }
    for (const a of dueAssets) {
      const due =
        [a.next_service_due, a.next_refill_due, a.next_hydro_due]
          .filter(Boolean)
          .sort()[0] || new Date().toISOString().slice(0, 10);
      const title = `${a.asset_type} service · ${a.name}`;
      const exists = await db
        .prepare(
          `SELECT id FROM amc_visits WHERE client_id = ? AND title = ? AND due_date = ? AND status IN ('Scheduled','Ticketed')`
        )
        .get(a.client_id, title, due);
      if (exists) continue;
      await db.prepare(
        `INSERT INTO amc_visits (client_id, site_id, title, visit_type, due_date, status, notes)
         VALUES (?, ?, ?, 'Asset', ?, 'Scheduled', ?)`
      ).run(
        a.client_id,
        a.site_id || null,
        title,
        due,
        `Auto from asset #${a.id} · serial ${a.serial_no || '—'}`
      );
      created += 1;
    }
  });
  res.json({ ok: true, created });
});

/** Turn scheduled visits into Unassigned tickets */
router.post('/visits/:id/ticket', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const v = await db.prepare('SELECT * FROM amc_visits WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Visit not found' });
  if (v.ticket_id) return res.json({ ok: true, ticketId: v.ticket_id, already: true });

  const code = await nextTicketCode();
  const ticketId = (await db
    .prepare(
      `INSERT INTO tickets (code, title, description, client_id, site_id, priority, status, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, 'High', 'Unassigned', ?, datetime('now'))`
    )
    .run(code, v.title, v.notes || 'AMC preventive visit', v.client_id, v.site_id, req.user.id)).lastInsertRowid;

  await db.prepare(`UPDATE amc_visits SET status = 'Ticketed', ticket_id = ? WHERE id = ?`).run(ticketId, v.id);
  res.status(201).json({ ok: true, ticketId, ticketCode: code });
});

module.exports = router;
