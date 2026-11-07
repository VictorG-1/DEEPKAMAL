const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['Unassigned', 'Assigned', 'On the way', 'In progress', 'Resolved', 'Closed'];
const OPEN_STATUSES = ['Unassigned', 'Assigned', 'On the way', 'In progress'];

function nextTicketCode() {
  const row = db
    .prepare(`SELECT MAX(CAST(REPLACE(code, 'DK-', '') AS INTEGER)) AS n FROM tickets WHERE code GLOB 'DK-[0-9]*'`)
    .get();
  return `DK-${(row?.n || 2900) + 1}`;
}

function mapTicket(t) {
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
    updated: relativeTime(t.updated_at),
    updatedAt: t.updated_at,
    createdAt: t.created_at
  };
}

function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(String(iso).replace(' ', 'T') + 'Z').getTime();
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

function getTicket(id) {
  return db.prepare(`${ticketSelect} WHERE t.id = ?`).get(id);
}

function logActivity(user, message, ticketId) {
  db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'ticket', ?)`)
    .run(user.id, message, ticketId);
}

router.get('/', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'resource') {
    rows = db.prepare(`${ticketSelect} WHERE t.assigned_user_id = ? ORDER BY t.updated_at DESC`).all(req.user.id);
  } else if (req.user.role === 'customer') {
    const user = db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    rows = db
      .prepare(`${ticketSelect} WHERE t.client_id = ? ORDER BY t.updated_at DESC`)
      .all(user?.client_id || -1);
  } else {
    rows = db.prepare(`${ticketSelect} ORDER BY t.updated_at DESC`).all();
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
  return {
    lat: Number(process.env.DEEPKAMAL_HQ_LAT || 28.4595),
    lng: Number(process.env.DEEPKAMAL_HQ_LNG || 77.0266)
  };
}

/** City → rough lat/lng for map when site coords missing */
const CITY_COORDS = {
  gurgaon: [28.4595, 77.0266],
  gurugram: [28.4595, 77.0266],
  delhi: [28.6139, 77.209],
  noida: [28.5355, 77.391],
  mumbai: [19.076, 72.8777],
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

router.get('/dispatch', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const openRows = db
    .prepare(
      `${ticketSelect} WHERE t.status IN ('Unassigned','Assigned','On the way','In progress') ORDER BY
        CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END,
        t.updated_at DESC`
    )
    .all();

  const hq = hqCoords();
  const open = openRows.map((row) => {
    const t = mapTicket(row);
    const site = row.site_id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(row.site_id) : null;
    const coords = resolveSiteCoords(site, row.client_location);
    const km = Math.round(haversineKm(hq.lat, hq.lng, coords.lat, coords.lng) * 10) / 10;
    const etaMins = Math.max(15, Math.round((km / 25) * 60) + 10); // ~25 km/h city + 10 min buffer
    return {
      ...t,
      map: { ...coords, kmFromHq: km, etaMins, etaLabel: `${etaMins} min` }
    };
  });

  const partners = db
    .prepare(
      `SELECT id, name, initials, avatar_color, availability, job_title, team, home_lat, home_lng,
        (SELECT COUNT(*) FROM tickets WHERE assigned_user_id = users.id AND status IN ('Assigned','On the way','In progress')) AS active_jobs
       FROM users WHERE role = 'resource' ORDER BY name`
    )
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      initials: p.initials,
      avatarColor: p.avatar_color,
      availability: p.availability,
      jobTitle: p.job_title,
      team: p.team,
      activeJobs: p.active_jobs,
      lat: p.home_lat,
      lng: p.home_lng
    }));

  res.json({
    unassigned: open.filter((t) => t.status === 'Unassigned'),
    active: open.filter((t) => t.status !== 'Unassigned'),
    partners,
    hq,
    mapJobs: open
  });
});

function canAccessTicket(user, ticket) {
  if (!ticket) return false;
  if (['admin', 'manager'].includes(user.role)) return true;
  if (user.role === 'resource' && ticket.assigned_user_id === user.id) return true;
  if (user.role === 'customer') {
    const u = db.prepare('SELECT client_id FROM users WHERE id = ?').get(user.id);
    return u?.client_id && u.client_id === ticket.client_id;
  }
  return false;
}

router.get('/:id/messages', requireAuth, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!canAccessTicket(req.user, ticket)) return res.status(403).json({ error: 'Not allowed' });
  const messages = db
    .prepare(
      `SELECT m.*, u.name AS user_name, u.initials FROM ticket_messages m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.ticket_id = ? ORDER BY m.id`
    )
    .all(ticket.id)
    .map((m) => ({
      id: m.id,
      body: m.body,
      role: m.role,
      userName: m.user_name || 'System',
      initials: m.initials || '?',
      createdAt: m.created_at
    }));
  res.json({ messages, ticket: mapTicket(getTicket(ticket.id)) });
});

router.post('/:id/messages', requireAuth, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!canAccessTicket(req.user, ticket)) return res.status(403).json({ error: 'Not allowed' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message required' });
  const result = db
    .prepare(`INSERT INTO ticket_messages (ticket_id, user_id, role, body) VALUES (?, ?, ?, ?)`)
    .run(ticket.id, req.user.id, req.user.role, body.slice(0, 2000));
  db.prepare(`UPDATE tickets SET updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  const m = db
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

router.post('/', requireAuth, (req, res) => {
  const { title, description, clientId, siteId, priority, assignedUserId } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required' });

  let resolvedClientId = clientId || null;
  if (req.user.role === 'customer') {
    const user = db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    resolvedClientId = user?.client_id || null;
  }

  const status = assignedUserId ? 'Assigned' : 'Unassigned';
  const code = nextTicketCode();
  const result = db
    .prepare(
      `INSERT INTO tickets (code, title, description, client_id, site_id, assigned_user_id, priority, status, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
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
      req.user.id
    );

  logActivity(req.user, `${req.user.name} created ticket ${code}`, result.lastInsertRowid);
  res.status(201).json({ ticket: mapTicket(getTicket(result.lastInsertRowid)) });
});

router.post('/:id/assign', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const assignedUserId = Number(req.body?.assignedUserId);
  if (!assignedUserId) return res.status(400).json({ error: 'assignedUserId is required' });

  const partner = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'resource'`).get(assignedUserId);
  if (!partner) return res.status(400).json({ error: 'Partner not found' });

  db.prepare(
    `UPDATE tickets SET assigned_user_id = ?, status = 'Assigned', updated_at = datetime('now') WHERE id = ?`
  ).run(partner.id, ticket.id);

  db.prepare(`UPDATE users SET availability = 'On site' WHERE id = ?`).run(partner.id);
  logActivity(req.user, `${req.user.name} assigned ${ticket.code} to ${partner.name}`, ticket.id);
  try {
    const { notifyAssignment } = require('../lib/notify');
    notifyAssignment(getTicket(ticket.id), partner);
  } catch (_) {
    /* optional */
  }

  res.json({ ticket: mapTicket(getTicket(ticket.id)) });
});

router.post('/:id/status', requireAuth, requireRole('admin', 'manager', 'resource'), (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const status = req.body?.status;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
  }

  if (req.user.role === 'resource' && ticket.assigned_user_id !== req.user.id) {
    return res.status(403).json({ error: 'This job is not assigned to you' });
  }

  db.prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, ticket.id);
  logActivity(req.user, `${req.user.name} set ${ticket.code} to ${status}`, ticket.id);

  if (status === 'Resolved' || status === 'Closed') {
    if (ticket.assigned_user_id) {
      db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ?`).run(ticket.assigned_user_id);
    }
  }

  res.json({ ticket: mapTicket(getTicket(ticket.id)) });
});

router.post('/:id/complete', requireAuth, requireRole('admin', 'manager', 'resource'), (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (req.user.role === 'resource' && ticket.assigned_user_id !== req.user.id) {
    return res.status(403).json({ error: 'This job is not assigned to you' });
  }

  const { latitude, longitude, notes, capturedAt } = req.body || {};
  const evidence = db
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

  db.prepare(`UPDATE tickets SET status = 'Resolved', updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  if (ticket.assigned_user_id) {
    db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ?`).run(ticket.assigned_user_id);
  }

  logActivity(req.user, `${req.user.name} completed ${ticket.code}`, ticket.id);

  res.json({
    ok: true,
    evidenceId: evidence.lastInsertRowid,
    ticket: mapTicket(getTicket(ticket.id))
  });
});

router.patch('/:id', requireAuth, requireRole('admin', 'manager', 'resource'), (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
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

  db.prepare(
    `UPDATE tickets SET
      status = ?,
      assigned_user_id = ?,
      priority = COALESCE(?, priority),
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextAssignee, priority || null, title || null, description || null, ticket.id);

  res.json({ ticket: mapTicket(getTicket(ticket.id)) });
});

module.exports = router;
module.exports.OPEN_STATUSES = OPEN_STATUSES;
