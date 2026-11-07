const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
  const works = (await db.prepare(`
    SELECT w.*, c.name AS client_name, c.location AS client_location, s.name AS site_name
    FROM site_works w
    LEFT JOIN clients c ON c.id = w.client_id
    LEFT JOIN sites s ON s.id = w.site_id
    WHERE w.status = 'ACTIVE'
    ORDER BY w.due_date
  `).all()).map((w) => ({
    id: w.id,
    client: w.client_name,
    title: w.title,
    location: w.client_location || w.site_name,
    progress: w.progress,
    dueDate: w.due_date,
    team: w.team
  }));
  res.json({ works });
});

router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const { title, clientId, siteId, team, dueDate, progress } = req.body || {};
  if (!title || !clientId) {
    return res.status(400).json({ error: 'title and clientId are required' });
  }
  const result = await db.prepare(`
    INSERT INTO site_works (title, client_id, site_id, team, progress, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
  `).run(
    title,
    clientId,
    siteId || null,
    team || 'Unassigned',
    progress || 0,
    dueDate || null
  );
  await db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'site_work', ?)`)
    .run(req.user.id, `${req.user.name} scheduled site work: ${title}`, result.lastInsertRowid);

  const w = await db.prepare(`
    SELECT w.*, c.name AS client_name, c.location AS client_location
    FROM site_works w LEFT JOIN clients c ON c.id = w.client_id WHERE w.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({
    work: {
      id: w.id,
      client: w.client_name,
      title: w.title,
      location: w.client_location,
      progress: w.progress,
      dueDate: w.due_date,
      team: w.team
    }
  });
});

router.patch('/:id', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const work = await db.prepare('SELECT * FROM site_works WHERE id = ?').get(req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  const { progress, status, team, dueDate } = req.body || {};
  await db.prepare(
    `UPDATE site_works SET
      progress = COALESCE(?, progress),
      status = COALESCE(?, status),
      team = COALESCE(?, team),
      due_date = COALESCE(?, due_date)
     WHERE id = ?`
  ).run(
    progress != null ? Number(progress) : null,
    status || null,
    team || null,
    dueDate || null,
    work.id
  );
  const w = await db
    .prepare(
      `SELECT w.*, c.name AS client_name, c.location AS client_location, s.name AS site_name
       FROM site_works w
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN sites s ON s.id = w.site_id
       WHERE w.id = ?`
    )
    .get(work.id);
  res.json({
    work: {
      id: w.id,
      client: w.client_name,
      title: w.title,
      location: w.client_location || w.site_name,
      progress: w.progress,
      dueDate: w.due_date,
      team: w.team,
      status: w.status
    }
  });
});

module.exports = router;
