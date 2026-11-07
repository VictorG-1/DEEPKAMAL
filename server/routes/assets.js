const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function makeQrToken(id) {
  return `DKA${String(id).padStart(5, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function mapAsset(a) {
  return {
    id: a.id,
    clientId: a.client_id,
    siteId: a.site_id,
    client: a.client_name,
    site: a.site_name,
    assetType: a.asset_type,
    name: a.name,
    serialNo: a.serial_no,
    locationNote: a.location_note,
    capacity: a.capacity,
    installedOn: a.installed_on,
    lastServiceOn: a.last_service_on,
    nextServiceDue: a.next_service_due,
    nextRefillDue: a.next_refill_due,
    nextHydroDue: a.next_hydro_due,
    status: a.status,
    notes: a.notes,
    qrToken: a.qr_token,
    scanPath: a.qr_token ? `/a/${a.qr_token}` : null,
    overdue:
      [a.next_service_due, a.next_refill_due, a.next_hydro_due].some(
        (d) => d && d <= new Date().toISOString().slice(0, 10)
      ) || false
  };
}

const select = `
  SELECT a.*, c.name AS client_name, s.name AS site_name
  FROM site_assets a
  LEFT JOIN clients c ON c.id = a.client_id
  LEFT JOIN sites s ON s.id = a.site_id
`;

router.get('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const due = String(req.query.due || '') === '1';
  let rows;
  if (due) {
    rows = await db
      .prepare(
        `${select} WHERE a.status = 'Active' AND (
          date(a.next_service_due) <= date('now', '+30 day')
          OR date(a.next_refill_due) <= date('now', '+30 day')
          OR date(a.next_hydro_due) <= date('now', '+30 day')
        ) ORDER BY COALESCE(a.next_service_due, a.next_refill_due, a.next_hydro_due)`
      )
      .all();
  } else {
    rows = await db.prepare(`${select} ORDER BY a.id DESC`).all();
  }
  res.json({ assets: rows.map(mapAsset), dueSoon: rows.filter((a) => mapAsset(a).overdue).length });
});

router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.assetType) return res.status(400).json({ error: 'name and assetType required' });
  const result = await db
    .prepare(
      `INSERT INTO site_assets (
        client_id, site_id, asset_type, name, serial_no, location_note, capacity,
        installed_on, last_service_on, next_service_due, next_refill_due, next_hydro_due, status, notes, qr_token
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      b.clientId || null,
      b.siteId || null,
      b.assetType,
      b.name,
      b.serialNo || null,
      b.locationNote || null,
      b.capacity || null,
      b.installedOn || null,
      b.lastServiceOn || null,
      b.nextServiceDue || null,
      b.nextRefillDue || null,
      b.nextHydroDue || null,
      b.status || 'Active',
      b.notes || null,
      'pending'
    );
  const id = result.lastInsertRowid;
  const token = makeQrToken(id);
  await db.prepare(`UPDATE site_assets SET qr_token = ? WHERE id = ?`).run(token, id);
  await db.prepare(
    `INSERT INTO asset_service_log (asset_id, event_type, notes, performed_by) VALUES (?, 'Registered', ?, ?)`
  ).run(id, `Asset created · ${b.assetType}`, req.user.id);
  const created = await db.prepare(`${select} WHERE a.id = ?`).get(id);
  res.status(201).json({ asset: mapAsset(created) });
});

router.patch('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const a = await db.prepare('SELECT * FROM site_assets WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Asset not found' });
  const b = req.body || {};
  await db.prepare(
    `UPDATE site_assets SET
      name = COALESCE(?, name),
      serial_no = COALESCE(?, serial_no),
      location_note = COALESCE(?, location_note),
      last_service_on = COALESCE(?, last_service_on),
      next_service_due = COALESCE(?, next_service_due),
      next_refill_due = COALESCE(?, next_refill_due),
      next_hydro_due = COALESCE(?, next_hydro_due),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes)
     WHERE id = ?`
  ).run(
    b.name || null,
    b.serialNo || null,
    b.locationNote || null,
    b.lastServiceOn || null,
    b.nextServiceDue || null,
    b.nextRefillDue || null,
    b.nextHydroDue || null,
    b.status || null,
    b.notes || null,
    a.id
  );
  if (b.logNote || b.lastServiceOn) {
    await db.prepare(
      `INSERT INTO asset_service_log (asset_id, event_type, notes, performed_by) VALUES (?, ?, ?, ?)`
    ).run(a.id, b.eventType || 'Service', b.logNote || 'Service / due dates updated', req.user.id);
  }
  const updated = await db.prepare(`${select} WHERE a.id = ?`).get(a.id);
  res.json({ asset: mapAsset(updated) });
});

router.get('/:id/sticker', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const a = await db.prepare(`${select} WHERE a.id = ?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Asset not found' });
  let token = a.qr_token;
  if (!token) {
    token = makeQrToken(a.id);
    await db.prepare(`UPDATE site_assets SET qr_token = ? WHERE id = ?`).run(token, a.id);
  }
  const origin = `${req.protocol}://${req.get('host')}`;
  const url = `${origin}/a/${token}`;
  const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
  res.json({
    asset: mapAsset({ ...a, qr_token: token }),
    url,
    qrImage,
    label: `${a.asset_type} · ${a.name}`
  });
});

/** Public scan page data */
router.get('/public/:token', async (req, res) => {
  const a = await db.prepare(`${select} WHERE a.qr_token = ?`).get(req.params.token);
  if (!a) return res.status(404).json({ error: 'Asset not found' });
  const history = (await db
    .prepare(
      `SELECT l.*, u.name AS user_name FROM asset_service_log l
       LEFT JOIN users u ON u.id = l.performed_by
       WHERE l.asset_id = ? ORDER BY l.id DESC LIMIT 40`
    )
    .all(a.id))
    .map((h) => ({
      id: h.id,
      eventType: h.event_type,
      notes: h.notes,
      userName: h.user_name,
      createdAt: h.created_at
    }));
  res.json({ asset: mapAsset(a), history });
});

module.exports = router;
