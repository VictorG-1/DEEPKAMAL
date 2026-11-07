const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const openTickets = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status IN ('Unassigned','Assigned','On the way','In progress')`).get().c;
  const activeWork = db.prepare(`SELECT COUNT(*) AS c FROM site_works WHERE status = 'ACTIVE'`).get().c;
  const resolvedMonth = db.prepare(`
    SELECT COUNT(*) AS c FROM tickets
    WHERE status IN ('Resolved','Closed')
      AND strftime('%Y-%m', updated_at) = strftime('%Y-%m', 'now')
  `).get().c;
  const fieldOnline = db.prepare(`
    SELECT COUNT(*) AS c FROM users WHERE role = 'resource' AND availability != 'Offline'
  `).get().c;
  const fieldTotal = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'resource'`).get().c;
  const unassigned = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'Unassigned'`).get().c;
  const assignedOpen = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status IN ('Assigned','On the way','In progress')`).get().c;

  const activity = db.prepare(`
    SELECT a.*, u.name, u.initials, u.avatar_color
    FROM activity_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT 10
  `).all().map((a) => ({
    id: a.id,
    message: a.message,
    name: a.name,
    initials: a.initials || 'DK',
    color: a.avatar_color || 'blue',
    createdAt: a.created_at
  }));

  const works = db.prepare(`
    SELECT w.*, c.name AS client_name, c.location AS client_location, s.name AS site_name
    FROM site_works w
    LEFT JOIN clients c ON c.id = w.client_id
    LEFT JOIN sites s ON s.id = w.site_id
    WHERE w.status = 'ACTIVE'
    ORDER BY w.due_date
  `).all().map((w) => ({
    id: w.id,
    client: w.client_name,
    title: w.title,
    location: w.client_location || w.site_name,
    progress: w.progress,
    dueDate: w.due_date,
    team: w.team
  }));

  let resource = null;
  if (req.user.role === 'resource') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const myTickets = db.prepare(`
      SELECT t.*, c.name AS client_name, s.name AS site_name, t.description
      FROM tickets t
      LEFT JOIN clients c ON c.id = t.client_id
      LEFT JOIN sites s ON s.id = t.site_id
      WHERE t.assigned_user_id = ? AND t.status IN ('Assigned','On the way','In progress')
      ORDER BY t.updated_at DESC
    `).all(user.id);
    resource = {
      wageBalance: user.wage_balance,
      claimsThisMonth: user.claims_this_month,
      claimsRemaining: Math.max(0, 3 - user.claims_this_month),
      kycStatus: user.kyc_status,
      availability: user.availability,
      activeJobs: myTickets.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        description: t.description,
        client: t.client_name,
        site: t.site_name,
        priority: t.priority,
        status: t.status
      }))
    };
  }

  let customer = null;
  if (req.user.role === 'customer') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const client = user.client_id
      ? db.prepare('SELECT * FROM clients WHERE id = ?').get(user.client_id)
      : null;
    const feedback = db.prepare(`
      SELECT AVG(rating) AS avg_rating, COUNT(*) AS count
      FROM feedback WHERE customer_user_id = ?
    `).get(user.id);
    customer = {
      clientName: client?.name,
      amcStatus: client?.amc_status,
      amcExpires: client?.amc_expires,
      referralCode: client?.referral_code,
      feedbackAvg: feedback.avg_rating ? Number(feedback.avg_rating).toFixed(1) : null,
      feedbackCount: feedback.count
    };
  }

  const amcDue = db
    .prepare(
      `SELECT id, name, location, amc_expires, amc_status FROM clients
       WHERE amc_expires IS NOT NULL AND date(amc_expires) <= date('now', '+45 day')
       ORDER BY amc_expires LIMIT 10`
    )
    .all()
    .map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      expires: c.amc_expires,
      status: c.amc_status
    }));

  const lowStock = db
    .prepare(
      `SELECT COUNT(*) AS c FROM materials m
       LEFT JOIN inventory_stock s ON s.material_id = m.id
       WHERE m.active = 1 AND COALESCE(s.qty, 0) <= 50`
    )
    .get().c;

  const pendingClaims = db.prepare(`SELECT COUNT(*) AS c FROM salary_claims WHERE status = 'Pending'`).get().c;

  res.json({
    stats: {
      openTickets,
      activeWork,
      resolvedMonth,
      fieldOnline,
      fieldTotal,
      unassigned,
      assignedOpen,
      amcDue: amcDue.length,
      lowStock,
      pendingClaims
    },
    activity,
    works,
    amcDue,
    resource,
    customer
  });
});

router.post('/evidence', requireAuth, requireRoleSafe, (req, res) => {
  const { siteWorkId, ticketId, latitude, longitude, notes, capturedAt } = req.body || {};
  const result = db.prepare(`
    INSERT INTO work_evidence (site_work_id, ticket_id, user_id, captured_at, latitude, longitude, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    siteWorkId || null,
    ticketId || null,
    req.user.id,
    capturedAt || new Date().toISOString(),
    latitude ?? null,
    longitude ?? null,
    notes || null
  );

  if (siteWorkId) {
    db.prepare(`UPDATE site_works SET progress = 100, status = 'COMPLETED' WHERE id = ?`).run(siteWorkId);
  }
  if (ticketId) {
    db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(ticketId);
  }

  db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'evidence', ?)`)
    .run(req.user.id, `${req.user.name} submitted site completion evidence`, result.lastInsertRowid);

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

function requireRoleSafe(req, res, next) {
  if (!['admin', 'manager', 'resource'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have access to this action' });
  }
  next();
}

module.exports = router;
