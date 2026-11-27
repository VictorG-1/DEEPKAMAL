const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['Unassigned', 'Assigned', 'On the way', 'In progress', 'Resolved', 'Closed'];
const OPEN_STATUSES = ['Unassigned', 'Assigned', 'On the way', 'In progress'];

async function nextTicketCode() {
  // Works on both SQLite and Postgres (avoid SQLite-only GLOB)
  const row = await db
    .prepare(
      `SELECT MAX(CAST(REPLACE(code, 'DK-', '') AS INTEGER)) AS n
       FROM tickets
       WHERE code LIKE 'DK-%'`
    )
    .get();
  return `DK-${Number(row?.n || 2900) + 1}`;
}

function mapTicket(t, extras = {}) {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    client: t.client_name ? `${t.client_name}${t.client_location ? ' · ' + t.client_location : ''}` : '—',
    clientId: t.client_id,
    siteId: t.site_id,
    siteName: t.site_name,
    person: t.assignee_name || 'Unassigned',
    assignedUserId: t.assigned_user_id,
    initials: t.assignee_initials || '?',
    avatarColor: t.assignee_color || 'gold',
    priority: t.priority,
    status: t.status,
    crewRequired: t.crew_required || 1,
    workType: t.work_type || 'daily_wage',
    orderId: t.order_id || null,
    startVerified: Boolean(t.start_verified_at),
    completeVerified: Boolean(t.complete_verified_at),
    saleValue: t.sale_value || 0,
    purchaseValue: t.purchase_value || 0,
    labourCost: t.labour_cost || 0,
    materialCost: t.material_cost || 0,
    costMode: t.cost_mode || 'with_labour',
    updated: relativeTime(t.updated_at),
    updatedAt: t.updated_at,
    createdAt: t.created_at,
    ...extras
  };
}

function relativeTime(iso) {
  if (!iso) return '—';
  const raw = String(iso).trim();
  // Postgres may return "YYYY-MM-DD HH:MM:SS" or ISO with timezone
  let parsed = Date.parse(raw);
  if (Number.isNaN(parsed) && /^\d{4}-\d{2}-\d{2} /.test(raw)) {
    parsed = Date.parse(raw.replace(' ', 'T') + '+05:30');
  }
  if (Number.isNaN(parsed)) return '—';
  const diff = Date.now() - parsed;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

const ticketSelect = `
  SELECT t.*, c.name AS client_name, c.location AS client_location,
         s.name AS site_name, u.name AS assignee_name, u.initials AS assignee_initials,
         u.avatar_color AS assignee_color
  FROM tickets t
  LEFT JOIN clients c ON c.id = t.client_id
  LEFT JOIN sites s ON s.id = t.site_id
  LEFT JOIN users u ON u.id = t.assigned_user_id
`;

async function getTicket(id) {
  return await db.prepare(`${ticketSelect} WHERE t.id = ?`).get(id);
}

async function logActivity(user, message, ticketId) {
  await db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'ticket', ?)`)
    .run(user.id, message, ticketId);
}

router.get('/', requireAuth, async (req, res) => {
  let rows;
  if (req.user.role === 'resource') {
    rows = await db.prepare(`${ticketSelect} WHERE t.assigned_user_id = ? ORDER BY t.updated_at DESC`).all(req.user.id);
  } else if (req.user.role === 'customer') {
    const user = await db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    rows = await db
      .prepare(`${ticketSelect} WHERE t.client_id = ? ORDER BY t.updated_at DESC`)
      .all(user?.client_id || -1);
  } else {
    rows = await db.prepare(`${ticketSelect} ORDER BY t.updated_at DESC`).all();
  }
  res.json({ tickets: rows.map(mapTicket), statuses: STATUSES });
});

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hqCoords() {
  // Default: Borivali Chikuwadi (Mumbai ops)
  return {
    lat: Number(process.env.DEEPKAMAL_HQ_LAT || 19.2305),
    lng: Number(process.env.DEEPKAMAL_HQ_LNG || 72.847)
  };
}

/** City → rough lat/lng for map when site coords missing */
const CITY_COORDS = {
  gurgaon: [28.4595, 77.0266],
  gurugram: [28.4595, 77.0266],
  delhi: [28.6139, 77.209],
  noida: [28.5355, 77.391],
  mumbai: [19.076, 72.8777],
  borivali: [19.2305, 72.847],
  chikuwadi: [19.2305, 72.847],
  thane: [19.2183, 72.9781],
  pune: [18.5204, 73.8567]
};

function resolveSiteCoords(site, clientLocation) {
  if (site?.latitude != null && site?.longitude != null) {
    return { lat: site.latitude, lng: site.longitude, source: 'site' };
  }
  const key = String(clientLocation || site?.city || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  for (const [city, pair] of Object.entries(CITY_COORDS)) {
    if (key.includes(city)) return { lat: pair[0], lng: pair[1], source: 'city' };
  }
  const hq = hqCoords();
  return { lat: hq.lat + (Math.random() - 0.5) * 0.08, lng: hq.lng + (Math.random() - 0.5) * 0.08, source: 'approx' };
}

router.get('/dispatch', requireAuth, requireRole('admin', 'manager'), async (_req, res) => {
  const openRows = await db
    .prepare(
      `${ticketSelect} WHERE t.status IN ('Unassigned','Assigned','On the way','In progress') ORDER BY
        CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END,
        t.updated_at DESC`
    )
    .all();

  const hq = hqCoords();
  const open = await Promise.all(openRows.map(async (row) => {
    const t = mapTicket(row);
    const site = row.site_id ? await db.prepare('SELECT * FROM sites WHERE id = ?').get(row.site_id) : null;
    const coords = resolveSiteCoords(site, row.client_location);
    const km = Math.round(haversineKm(hq.lat, hq.lng, coords.lat, coords.lng) * 10) / 10;
    const etaMins = Math.max(15, Math.round((km / 25) * 60) + 10); // ~25 km/h city + 10 min buffer
    return {
      ...t,
      map: { ...coords, kmFromHq: km, etaMins, etaLabel: `${etaMins} min` }
    };
  }));

  const partners = (await db
    .prepare(
      `SELECT id, name, initials, avatar_color, availability, job_title, team, home_lat, home_lng,
        (SELECT COUNT(*) FROM tickets WHERE assigned_user_id = users.id AND status IN ('Assigned','On the way','In progress')) AS active_jobs
       FROM users WHERE role = 'resource' ORDER BY name`
    )
    .all())
    .map((p) => ({
      id: p.id,
      name: p.name,
      initials: p.initials,
      avatarColor: p.avatar_color,
      availability: p.availability,
      jobTitle: p.job_title,
      team: p.team,
      activeJobs: Number(p.active_jobs || 0),
      lat: p.home_lat != null ? Number(p.home_lat) : null,
      lng: p.home_lng != null ? Number(p.home_lng) : null,
      area: p.home_lat != null ? 'Chikuwadi · Borivali W' : null,
      live: p.home_lat != null
    }));

  res.json({
    unassigned: open.filter((t) => t.status === 'Unassigned'),
    active: open.filter((t) => t.status !== 'Unassigned'),
    partners,
    hq,
    mapJobs: open
  });
});

async function canAccessTicket(user, ticket) {
  if (!ticket) return false;
  if (['admin', 'manager'].includes(user.role)) return true;
  if (user.role === 'resource' && ticket.assigned_user_id === user.id) return true;
  if (user.role === 'customer') {
    const u = await db.prepare('SELECT client_id FROM users WHERE id = ?').get(user.id);
    return u?.client_id && u.client_id === ticket.client_id;
  }
  return false;
}

router.get('/:id/messages', requireAuth, async (req, res) => {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!canAccessTicket(req.user, ticket)) return res.status(403).json({ error: 'Not allowed' });
  const messages = (await db
    .prepare(
      `SELECT m.*, u.name AS user_name, u.initials FROM ticket_messages m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.ticket_id = ? ORDER BY m.id`
    )
    .all(ticket.id))
    .map((m) => ({
      id: m.id,
      body: m.body,
      role: m.role,
      userName: m.user_name || 'System',
      initials: m.initials || '?',
      createdAt: m.created_at
    }));
  res.json({ messages, ticket: mapTicket(await getTicket(ticket.id)) });
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!canAccessTicket(req.user, ticket)) return res.status(403).json({ error: 'Not allowed' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message required' });
  const result = await db
    .prepare(`INSERT INTO ticket_messages (ticket_id, user_id, role, body) VALUES (?, ?, ?, ?)`)
    .run(ticket.id, req.user.id, req.user.role, body.slice(0, 2000));
  await db.prepare(`UPDATE tickets SET updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  const m = await db
    .prepare(
      `SELECT m.*, u.name AS user_name, u.initials FROM ticket_messages m
       LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json({
    message: {
      id: m.id,
      body: m.body,
      role: m.role,
      userName: m.user_name,
      initials: m.initials,
      createdAt: m.created_at
    }
  });
});

router.post('/', requireAuth, async (req, res) => {
  const { title, description, clientId, siteId, priority, assignedUserId, crewRequired, workType } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required' });

  let resolvedClientId = clientId || null;
  if (req.user.role === 'customer') {
    const user = await db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    resolvedClientId = user?.client_id || null;
  }

  const status = assignedUserId ? 'Assigned' : 'Unassigned';
  const code = await nextTicketCode();
  const crew = Math.max(1, Number(crewRequired) || 1);
  const wt = workType === 'contract' ? 'contract' : 'daily_wage';
  const result = await db
    .prepare(
      `INSERT INTO tickets (code, title, description, client_id, site_id, assigned_user_id, priority, status, created_by, updated_at, crew_required, work_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`
    )
    .run(
      code,
      title,
      description || null,
      resolvedClientId,
      siteId || null,
      assignedUserId || null,
      priority || 'Normal',
      status,
      req.user.id,
      crew,
      wt
    );

  await logActivity(req.user, `${req.user.name} created ticket ${code}`, result.lastInsertRowid);
  res.status(201).json({ ticket: mapTicket(await getTicket(result.lastInsertRowid)) });
});

router.get('/:id/crew', requireAuth, async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT tc.*, u.name, u.initials, u.daily_wage, u.engagement_type
       FROM ticket_crew tc JOIN users u ON u.id = tc.user_id
       WHERE tc.ticket_id = ? ORDER BY tc.id`
    )
    .all(req.params.id);
  res.json({
    crew: rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      initials: r.initials,
      roleOnJob: r.role_on_job,
      dayWage: r.day_wage,
      workType: r.work_type || r.engagement_type
    }))
  });
});

router.post('/:id/assign', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const assignedUserId = Number(req.body?.assignedUserId);
  if (!assignedUserId) return res.status(400).json({ error: 'assignedUserId is required' });

  const partner = await db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'resource'`).get(assignedUserId);
  if (!partner) return res.status(400).json({ error: 'Partner not found' });

  const crewRequired = Math.max(1, Number(req.body?.crewRequired) || ticket.crew_required || 1);
  const workType = req.body?.workType === 'contract' ? 'contract' : req.body?.workType === 'daily_wage' ? 'daily_wage' : ticket.work_type || 'daily_wage';
  const crewIds = Array.isArray(req.body?.crewUserIds)
    ? req.body.crewUserIds.map(Number).filter(Boolean)
    : [];
  if (!crewIds.includes(partner.id)) crewIds.unshift(partner.id);

  await db.prepare(
    `UPDATE tickets SET assigned_user_id = ?, status = 'Assigned', crew_required = ?, work_type = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(partner.id, crewRequired, workType, ticket.id);

  await db.prepare(`DELETE FROM ticket_crew WHERE ticket_id = ?`).run(ticket.id);
  for (const uid of crewIds.slice(0, Math.max(crewRequired, crewIds.length))) {
    const u = await db.prepare(`SELECT id, daily_wage, engagement_type FROM users WHERE id = ? AND role = 'resource'`).get(uid);
    if (!u) continue;
    await db
      .prepare(
        `INSERT INTO ticket_crew (ticket_id, user_id, role_on_job, day_wage, work_type)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(ticket_id, user_id) DO UPDATE SET role_on_job = excluded.role_on_job, day_wage = excluded.day_wage, work_type = excluded.work_type`
      )
      .run(ticket.id, u.id, uid === partner.id ? 'lead' : 'helper', u.daily_wage || 0, workType || u.engagement_type || 'daily_wage');
  }

  await db.prepare(`UPDATE users SET availability = 'On site' WHERE id = ?`).run(partner.id);
  await logActivity(req.user, `${req.user.name} assigned ${ticket.code} to ${partner.name} (${crewRequired} people · ${workType})`, ticket.id);
  try {
    const { notifyAssignment } = require('../lib/notify');
    await notifyAssignment(await getTicket(ticket.id), partner);
  } catch (_) {
    /* optional */
  }

  res.json({ ticket: mapTicket(await getTicket(ticket.id)), crewCount: crewIds.length });
});

router.post('/:id/otp/start', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const { issueOtp } = require('../lib/otp');
  const ticket = await getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (req.user.role === 'resource' && ticket.assigned_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your job' });
  }
  const partner = await db.prepare('SELECT * FROM users WHERE id = ?').get(ticket.assigned_user_id || req.user.id);
  const target = partner?.phone || partner?.email;
  if (!target) return res.status(400).json({ error: 'Partner has no phone/email for OTP' });
  const issued = await issueOtp({
    purpose: 'work_start',
    target,
    channel: partner.phone ? 'sms' : 'email',
    entityType: 'ticket',
    entityId: ticket.id,
    userId: partner.id,
    subject: `Start OTP · ${ticket.code}`,
    bodyPrefix: `OTP to start job ${ticket.code} is`
  });
  res.json({
    ok: true,
    purpose: 'work_start',
    targetMasked: partner.phone ? `***${String(partner.phone).slice(-4)}` : partner.email,
    ...(issued.devCode ? { devCode: issued.devCode } : {})
  });
});

router.post('/:id/otp/start/verify', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const { verifyOtp } = require('../lib/otp');
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const partner = await db.prepare('SELECT * FROM users WHERE id = ?').get(ticket.assigned_user_id || req.user.id);
  const target = partner?.phone || partner?.email;
  const check = await verifyOtp({
    purpose: 'work_start',
    target,
    code: req.body?.code,
    entityType: 'ticket',
    entityId: ticket.id
  });
  if (!check.ok) return res.status(401).json({ error: check.error });
  await db
    .prepare(`UPDATE tickets SET start_verified_at = datetime('now'), status = CASE WHEN status = 'Assigned' THEN 'On the way' ELSE status END, updated_at = datetime('now') WHERE id = ?`)
    .run(ticket.id);
  res.json({ ok: true, ticket: mapTicket(await getTicket(ticket.id)) });
});

router.post('/:id/otp/complete', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const { issueOtp } = require('../lib/otp');
  const ticket = await getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const client = ticket.client_id
    ? await db.prepare('SELECT * FROM clients WHERE id = ?').get(ticket.client_id)
    : null;
  const customer = ticket.client_id
    ? await db.prepare(`SELECT * FROM users WHERE client_id = ? AND role = 'customer' ORDER BY id LIMIT 1`).get(ticket.client_id)
    : null;
  const target = client?.phone || customer?.phone || client?.email || customer?.email;
  if (!target) return res.status(400).json({ error: 'Customer has no phone/email for completion OTP' });
  const issued = await issueOtp({
    purpose: 'work_complete',
    target,
    channel: client?.phone || customer?.phone ? 'sms' : 'email',
    entityType: 'ticket',
    entityId: ticket.id,
    subject: `Completion OTP · ${ticket.code}`,
    bodyPrefix: `OTP to confirm job ${ticket.code} completion is`
  });
  res.json({
    ok: true,
    purpose: 'work_complete',
    sentTo: 'customer',
    targetMasked: String(target).includes('@') ? target.replace(/^(.{2}).+(@.+)$/, '$1***$2') : `***${String(target).slice(-4)}`,
    ...(issued.devCode ? { devCode: issued.devCode } : {})
  });
});

router.post('/:id/otp/complete/verify', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const { verifyOtp } = require('../lib/otp');
  const ticket = await getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const client = ticket.client_id
    ? await db.prepare('SELECT * FROM clients WHERE id = ?').get(ticket.client_id)
    : null;
  const customer = ticket.client_id
    ? await db.prepare(`SELECT * FROM users WHERE client_id = ? AND role = 'customer' ORDER BY id LIMIT 1`).get(ticket.client_id)
    : null;
  const target = client?.phone || customer?.phone || client?.email || customer?.email;
  const check = await verifyOtp({
    purpose: 'work_complete',
    target,
    code: req.body?.code,
    entityType: 'ticket',
    entityId: ticket.id
  });
  if (!check.ok) return res.status(401).json({ error: check.error });
  await db.prepare(`UPDATE tickets SET complete_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  res.json({ ok: true, ticket: mapTicket(await getTicket(ticket.id)) });
});

router.post('/:id/costing', requireAuth, requireRole('admin'), async (req, res) => {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const {
    saleValue = 0,
    purchaseValue = 0,
    labourCost = 0,
    materialCost = 0,
    costMode = 'with_labour'
  } = req.body || {};
  const mode = ['with_labour', 'with_material', 'without_material'].includes(costMode) ? costMode : 'with_labour';
  await db
    .prepare(
      `UPDATE tickets SET sale_value = ?, purchase_value = ?, labour_cost = ?, material_cost = ?, cost_mode = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(Number(saleValue) || 0, Number(purchaseValue) || 0, Number(labourCost) || 0, Number(materialCost) || 0, mode, ticket.id);
  res.json({ ticket: mapTicket(await getTicket(ticket.id)) });
});

router.post('/:id/status', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const status = req.body?.status;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
  }

  if (req.user.role === 'resource' && ticket.assigned_user_id !== req.user.id) {
    return res.status(403).json({ error: 'This job is not assigned to you' });
  }

  if (['On the way', 'In progress'].includes(status) && !ticket.start_verified_at && req.user.role === 'resource') {
    return res.status(400).json({ error: 'Verify work-start OTP before starting the job', needsStartOtp: true });
  }

  await db.prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, ticket.id);
  await logActivity(req.user, `${req.user.name} set ${ticket.code} to ${status}`, ticket.id);

  if (status === 'Resolved' || status === 'Closed') {
    if (ticket.assigned_user_id) {
      await db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ?`).run(ticket.assigned_user_id);
    }
  }

  res.json({ ticket: mapTicket(await getTicket(ticket.id)) });
});

router.post('/:id/complete', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (req.user.role === 'resource' && ticket.assigned_user_id !== req.user.id) {
    return res.status(403).json({ error: 'This job is not assigned to you' });
  }

  if (!ticket.complete_verified_at) {
    return res.status(400).json({
      error: 'Customer completion OTP required before closing the job',
      needsCompleteOtp: true
    });
  }

  const { latitude, longitude, notes, capturedAt } = req.body || {};
  const evidence = await db
    .prepare(
      `INSERT INTO work_evidence (ticket_id, user_id, captured_at, latitude, longitude, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      ticket.id,
      req.user.id,
      capturedAt || new Date().toISOString(),
      latitude ?? null,
      longitude ?? null,
      notes || 'Job completed'
    );

  await db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  if (ticket.assigned_user_id) {
    await db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ?`).run(ticket.assigned_user_id);
  }

  // Collect remaining 50% on linked order
  if (ticket.order_id) {
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(ticket.order_id);
    if (order) {
      const balance = Math.max(0, Number(order.amount) - Number(order.amount_paid || 0));
      if (balance > 0) {
        await db
          .prepare(
            `UPDATE orders SET balance_due = ?, payment_status = 'BalanceDue', status = 'COMPLETED' WHERE id = ?`
          )
          .run(balance, order.id);
      } else {
        await db
          .prepare(`UPDATE orders SET payment_status = 'Paid', status = 'COMPLETED', completion_paid_at = datetime('now') WHERE id = ?`)
          .run(order.id);
      }
    }
  }

  await logActivity(req.user, `${req.user.name} completed ${ticket.code}`, ticket.id);

  res.json({
    ok: true,
    evidenceId: evidence.lastInsertRowid,
    ticket: mapTicket(await getTicket(ticket.id))
  });
});

router.patch('/:id', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { status, assignedUserId, priority, title, description } = req.body || {};
  const nextAssignee = assignedUserId !== undefined ? assignedUserId : ticket.assigned_user_id;
  let nextStatus = status || ticket.status;
  if (assignedUserId !== undefined && !status) {
    nextStatus = assignedUserId ? 'Assigned' : 'Unassigned';
  }
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  await db.prepare(
    `UPDATE tickets SET
      status = ?,
      assigned_user_id = ?,
      priority = COALESCE(?, priority),
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextAssignee, priority || null, title || null, description || null, ticket.id);

  res.json({ ticket: mapTicket(await getTicket(ticket.id)) });
});

module.exports = router;
module.exports.OPEN_STATUSES = OPEN_STATUSES;
