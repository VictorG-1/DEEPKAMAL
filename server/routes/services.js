const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function nextOrderCode() {
  const row = await db.prepare(`SELECT code FROM orders ORDER BY id DESC LIMIT 1`).get();
  const n = row ? parseInt(String(row.code).replace(/\D/g, ''), 10) + 1 : 2901;
  return `DK-${n}`;
}

function mapService(s) {
  return {
    id: s.id,
    categoryId: s.category_id,
    category: s.category_name || null,
    icon: s.icon,
    name: s.name,
    description: s.description,
    price: s.price,
    durationMins: s.duration_mins || 60
  };
}

router.get('/catalog', requireAuth, async (_req, res) => {
  const categories = (await db
    .prepare(`SELECT * FROM service_categories ORDER BY sort_order, id`)
    .all())
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
  const services = (await db
    .prepare(
      `SELECT s.*, c.name AS category_name
       FROM services s
       LEFT JOIN service_categories c ON c.id = s.category_id
       WHERE s.active = 1
       ORDER BY c.sort_order, s.id`
    )
    .all())
    .map(mapService);
  res.json({ categories, services });
});

router.get('/', requireAuth, async (_req, res) => {
  const services = (await db
    .prepare(
      `SELECT s.*, c.name AS category_name
       FROM services s
       LEFT JOIN service_categories c ON c.id = s.category_id
       WHERE s.active = 1 ORDER BY s.id`
    )
    .all())
    .map(mapService);
  res.json({ services });
});

router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const { name, description, price, icon, categoryId, durationMins } = req.body || {};
  if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
  const result = await db
    .prepare(
      `INSERT INTO services (category_id, icon, name, description, price, duration_mins, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .run(categoryId || null, icon || '◉', name.trim(), description || null, Number(price), durationMins || 60);
  const service = await db
    .prepare(
      `SELECT s.*, c.name AS category_name FROM services s
       LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json({ service: mapService(service) });
});

router.get('/orders', requireAuth, async (req, res) => {
  let orders;
  if (req.user.role === 'customer') {
    orders = await db
      .prepare(
        `SELECT o.*, s.name AS site_name, c.name AS client_name
         FROM orders o
         LEFT JOIN sites s ON s.id = o.site_id
         LEFT JOIN clients c ON c.id = o.client_id
         WHERE o.customer_user_id = ?
         ORDER BY o.booked_at DESC`
      )
      .all(req.user.id);
  } else {
    orders = await db
      .prepare(
        `SELECT o.*, s.name AS site_name, c.name AS client_name, u.name AS customer_name
         FROM orders o
         LEFT JOIN sites s ON s.id = o.site_id
         LEFT JOIN clients c ON c.id = o.client_id
         LEFT JOIN users u ON u.id = o.customer_user_id
         ORDER BY o.booked_at DESC`
      )
      .all();
  }

  res.json({
    orders: orders.map((o) => ({
      id: o.id,
      code: o.code,
      service: o.service_name,
      amount: o.amount,
      status: o.status,
      paymentStatus: o.payment_status,
      site: o.address || o.site_name || o.client_name || '—',
      address: o.address,
      slot: o.slot,
      bookedAt: formatDate(o.booked_at),
      customerName: o.customer_name
    }))
  });
});

router.post('/orders', requireAuth, async (req, res) => {
  const { serviceId, siteId, address, slot } = req.body || {};
  if (!serviceId) return res.status(400).json({ error: 'serviceId is required' });

  const service = await db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  let clientId = user.client_id;
  let resolvedSiteId = siteId || null;

  if (req.user.role !== 'customer' && req.body.clientId) clientId = req.body.clientId;

  if (!clientId && req.user.role === 'customer') {
    const created = await db
      .prepare(
        `INSERT INTO clients (name, location, sites_count, amc_status, referral_code)
         VALUES (?, ?, 1, 'New', ?)`
      )
      .run(user.name, address || null, user.name.replace(/\s+/g, '').slice(0, 8).toUpperCase() + '250');
    clientId = created.lastInsertRowid;
    await db.prepare('UPDATE users SET client_id = ? WHERE id = ?').run(clientId, user.id);
    await db.prepare(`INSERT INTO sites (client_id, name, address, city) VALUES (?, 'Primary site', ?, ?)`)
      .run(clientId, address || null, null);
  }

  if (!resolvedSiteId && clientId) {
    const firstSite = await db.prepare('SELECT id FROM sites WHERE client_id = ? LIMIT 1').get(clientId);
    resolvedSiteId = firstSite ? firstSite.id : null;
  }

  const code = await nextOrderCode();
  const payNow = req.body?.payNow !== false;
  const paymentStatus = payNow ? 'Paid' : 'Pending';
  const amountPaid = payNow ? service.price : 0;
  const result = await db
    .prepare(
      `INSERT INTO orders (
         code, customer_user_id, client_id, site_id, service_id, service_name,
         amount, status, payment_status, address, slot, amount_paid
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)`
    )
    .run(
      code,
      user.id,
      clientId,
      resolvedSiteId,
      service.id,
      service.name,
      service.price,
      paymentStatus,
      address || null,
      slot || null,
      amountPaid
    );
  if (payNow) {
    await db.prepare(
      `INSERT INTO payments (entity_type, entity_id, amount, method, status, reference, created_by)
       VALUES ('order', ?, ?, 'UPI', 'Paid', ?, ?)`
    ).run(result.lastInsertRowid, service.price, `BOOK-${code}`, user.id);
  }

  await db.prepare(
    `INSERT INTO tickets (code, title, description, client_id, site_id, priority, status, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 'Normal', 'Unassigned', ?, datetime('now'))`
  ).run(
    `${code}-T`,
    service.name,
    `Customer order ${code}${address ? ' · ' + address : ''}${slot ? ' · ' + slot : ''}`,
    clientId,
    resolvedSiteId,
    user.id
  );

  await db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'order', ?)`)
    .run(user.id, `${user.name} booked ${service.name} (${code})`, result.lastInsertRowid);

  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    order: {
      id: order.id,
      code: order.code,
      service: order.service_name,
      amount: order.amount,
      status: order.status,
      paymentStatus: order.payment_status,
      address: order.address,
      slot: order.slot,
      bookedAt: formatDate(order.booked_at)
    }
  });
});

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(String(iso).replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short'
  });
}

module.exports = router;
