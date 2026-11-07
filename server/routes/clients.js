const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function mapClient(c) {
  const openTickets = (await db
    .prepare(`SELECT COUNT(*) AS c FROM tickets WHERE client_id = ? AND status NOT IN ('Resolved','Closed')`)
    .get(c.id)).c;
  const quoteCount = (await db.prepare(`SELECT COUNT(*) AS c FROM quotations WHERE client_id = ?`).get(c.id)).c;
  const sites = await db.prepare('SELECT * FROM sites WHERE client_id = ?').all(c.id);
  return {
    id: c.id,
    name: c.name,
    location: c.location,
    address: c.address,
    phone: c.phone,
    email: c.email,
    gstin: c.gstin,
    contactPerson: c.contact_person,
    sitesCount: c.sites_count,
    openTickets,
    quoteCount,
    amcStatus: c.amc_status,
    amcExpires: c.amc_expires,
    referralCode: c.referral_code,
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      plannedMaterial: s.planned_material,
      usedMaterial: s.used_material,
      utilisation: s.planned_material ? Math.round((s.used_material / s.planned_material) * 100) : 0
    }))
  };
}

router.get('/', requireAuth, async (req, res) => {
  let clients;
  if (req.user.role === 'customer') {
    const user = await db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    clients = await db.prepare('SELECT * FROM clients WHERE id = ?').all(user.client_id);
  } else {
    clients = await db.prepare('SELECT * FROM clients ORDER BY name').all();
  }
  res.json({ clients: await Promise.all(clients.map(mapClient)) });
});

router.get('/:id', requireAuth, async (req, res) => {
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({ client: await mapClient(client) });
});

router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const { name, location, address, phone, email, gstin, contactPerson, sitesCount, amcStatus, siteName } =
    req.body || {};
  if (!name) return res.status(400).json({ error: 'Client name is required' });

  const result = await db
    .prepare(
      `INSERT INTO clients (name, location, sites_count, amc_status, referral_code, phone, email, gstin, address, contact_person)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      location || null,
      sitesCount || 1,
      amcStatus || 'Active AMC',
      name.replace(/\s+/g, '').slice(0, 8).toUpperCase() + '250',
      phone || null,
      email || null,
      gstin || null,
      address || location || null,
      contactPerson || null
    );

  const clientId = result.lastInsertRowid;
  await db.prepare(`INSERT INTO sites (client_id, name, address, city) VALUES (?, ?, ?, ?)`).run(
    clientId,
    siteName || 'Main site',
    address || location || null,
    location || null
  );

  res.status(201).json({
    client: await mapClient(await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId))
  });
});

router.patch('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const b = req.body || {};
  await db.prepare(
    `UPDATE clients SET
      name = COALESCE(?, name),
      location = COALESCE(?, location),
      address = COALESCE(?, address),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      gstin = COALESCE(?, gstin),
      contact_person = COALESCE(?, contact_person),
      amc_status = COALESCE(?, amc_status),
      sites_count = COALESCE(?, sites_count)
     WHERE id = ?`
  ).run(
    b.name || null,
    b.location || null,
    b.address || null,
    b.phone || null,
    b.email || null,
    b.gstin || null,
    b.contactPerson || null,
    b.amcStatus || null,
    b.sitesCount != null ? Number(b.sitesCount) : null,
    client.id
  );
  res.json({ client: await mapClient(await db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id)) });
});

router.get('/:id/sites', requireAuth, async (req, res) => {
  const sites = await db.prepare('SELECT * FROM sites WHERE client_id = ?').all(req.params.id);
  res.json({ sites });
});

module.exports = router;
