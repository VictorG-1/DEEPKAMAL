const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function creditFor(status, dailyWage) {
  const w = Number(dailyWage) || 0;
  if (status === 'Present') return w;
  if (status === 'Half day') return Math.round(w * 0.5 * 100) / 100;
  return 0;
}

function monthKey(day) {
  return String(day).slice(0, 7);
}

async function recalcWageBalance(userId, month = monthKey(new Date().toISOString().slice(0, 10))) {
  const user = await db.prepare('SELECT id, daily_wage FROM users WHERE id = ?').get(userId);
  if (!user) return 0;
  const days = await db
    .prepare(`SELECT status FROM attendance WHERE user_id = ? AND strftime('%Y-%m', date) = ?`)
    .all(userId, month);
  let earned = 0;
  for (const d of days) earned += creditFor(d.status, user.daily_wage);
  const claimed = (await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM salary_claims
       WHERE user_id = ? AND status IN ('Pending','Approved','Paid')
         AND strftime('%Y-%m', created_at) = ?`
    )
    .get(userId, month)).s;
  const balance = Math.max(0, Math.round((earned - Number(claimed)) * 100) / 100);
  await db.prepare(`UPDATE users SET wage_balance = ? WHERE id = ?`).run(balance, userId);
  return balance;
}

async function upsertAttendance(
  userId,
  status,
  day,
  { siteId = null, latitude = null, longitude = null, accuracy = null, workType = null } = {}
) {
  const user = await db.prepare('SELECT id, daily_wage, engagement_type FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const checkIn =
    latitude != null && longitude != null ? new Date().toISOString() : null;
  const wt = workType || user.engagement_type || 'daily_wage';

  await db.prepare(`
    INSERT INTO attendance (user_id, date, status, site_id, latitude, longitude, check_in_at, geo_accuracy, work_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      status = excluded.status,
      site_id = COALESCE(excluded.site_id, attendance.site_id),
      latitude = COALESCE(excluded.latitude, attendance.latitude),
      longitude = COALESCE(excluded.longitude, attendance.longitude),
      check_in_at = COALESCE(excluded.check_in_at, attendance.check_in_at),
      geo_accuracy = COALESCE(excluded.geo_accuracy, attendance.geo_accuracy),
      work_type = COALESCE(excluded.work_type, attendance.work_type)
  `).run(userId, day, status, siteId, latitude, longitude, checkIn, accuracy, wt);

  if (latitude != null && longitude != null) {
    await db.prepare(`UPDATE users SET home_lat = ?, home_lng = ? WHERE id = ?`).run(latitude, longitude, userId);
  }

  await recalcWageBalance(userId, monthKey(day));

  if (status === 'Present' || status === 'Half day') {
    await db.prepare(`UPDATE users SET availability = 'On site' WHERE id = ?`).run(userId);
  } else if (status === 'Absent') {
    await db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ? AND availability = 'On site'`).run(userId);
  }
}

router.get('/', requireAuth, requireRole('admin', 'manager', 'resource'), async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  let resources = await db
    .prepare(
      `SELECT id, name, initials, avatar_color, job_title, daily_wage, wage_balance, claims_this_month
       FROM users WHERE role = 'resource' ORDER BY name`
    )
    .all();
  if (req.user.role === 'resource') {
    resources = resources.filter((r) => r.id === req.user.id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = await Promise.all(resources.map(async (r) => {
    const days = await db
      .prepare(`SELECT status FROM attendance WHERE user_id = ? AND strftime('%Y-%m', date) = ?`)
      .all(r.id, month);

    let presentDays = 0;
    for (const d of days) {
      if (d.status === 'Present') presentDays += 1;
      if (d.status === 'Half day') presentDays += 0.5;
    }

    const todayRow = await db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(r.id, today);
    return {
      id: r.id,
      name: r.name,
      initials: r.initials,
      color: r.avatar_color,
      role: r.job_title,
      rate: r.daily_wage,
      days: presentDays,
      payable: presentDays * r.daily_wage,
      wageBalance: r.wage_balance || 0,
      claimsThisMonth: r.claims_this_month || 0,
      today: todayRow ? todayRow.status : 'Absent',
      geo:
        todayRow && todayRow.latitude != null
          ? {
              latitude: todayRow.latitude,
              longitude: todayRow.longitude,
              checkInAt: todayRow.check_in_at,
              accuracy: todayRow.geo_accuracy
            }
          : null
    };
  }));

  const payrollTotal = rows.reduce((sum, r) => sum + r.payable, 0);
  const wagePool = rows.reduce((sum, r) => sum + Number(r.wageBalance || 0), 0);
  const presentToday = rows.filter((r) => r.today === 'Present' || r.today === 'Half day').length;

  res.json({
    month,
    attendance: rows,
    payrollTotal,
    wagePool,
    presentToday,
    totalResources: rows.length
  });
});

router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const { userId, status, siteId, date, markAll, latitude, longitude, accuracy, workType } = req.body || {};
  const day = date || new Date().toISOString().slice(0, 10);

  if (!status || !['Present', 'Half day', 'Absent'].includes(status)) {
    return res.status(400).json({ error: 'Valid status is required (Present, Half day, Absent)' });
  }

  if (markAll && ['admin', 'manager'].includes(req.user.role)) {
    const team = await db.prepare(`SELECT id FROM users WHERE role = 'resource'`).all();
    await db.transaction(async () => {
      for (const u of team) await upsertAttendance(u.id, status, day, { siteId: siteId || null, workType: workType || null });
    });
    return res.status(201).json({ ok: true, date: day, marked: team.length, status, markAll: true });
  }

  const targetId = req.user.role === 'resource' ? req.user.id : Number(userId);
  if (!targetId) return res.status(400).json({ error: 'userId is required' });

  // Partners no longer self-mark; ops/admin mark with optional day work type
  if (req.user.role === 'resource') {
    return res.status(403).json({ error: 'Attendance is marked by DeepKamal office' });
  }

  await upsertAttendance(targetId, status, day, {
    siteId: siteId || null,
    latitude: latitude != null ? Number(latitude) : null,
    longitude: longitude != null ? Number(longitude) : null,
    accuracy: accuracy != null ? Number(accuracy) : null,
    workType: workType || null
  });
  const wageBalance = await recalcWageBalance(targetId, monthKey(day));
  const row = await db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(targetId, day);
  res.status(201).json({
    ok: true,
    date: day,
    userId: targetId,
    status,
    wageBalance,
    geo:
      row?.latitude != null
        ? { latitude: row.latitude, longitude: row.longitude, checkInAt: row.check_in_at }
        : null
  });
});

router.post('/claim', requireAuth, requireRole('resource'), async (req, res) => {
  const { weekKey } = require('../lib/otp');
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.payment_locked) {
    return res.status(403).json({ error: 'Payments are locked by admin. Contact DeepKamal office.' });
  }

  const wageBalance = await recalcWageBalance(user.id);
  if (!wageBalance || wageBalance <= 0) {
    return res.status(400).json({ error: 'No wage balance yet.' });
  }

  const wk = weekKey();
  const already = await db
    .prepare(
      `SELECT id FROM salary_claims
       WHERE user_id = ? AND week_key = ? AND status IN ('Pending','Approved','Paid')
       LIMIT 1`
    )
    .get(user.id, wk);
  if (already) {
    return res.status(400).json({ error: 'You can claim only once per week. Try again next week.' });
  }

  const gross = Math.round(Number(wageBalance) * 100) / 100;
  const retained = Math.round(gross * 0.2 * 100) / 100;
  const net = Math.round((gross - retained) * 100) / 100;

  await db
    .prepare(
      `INSERT INTO salary_claims (user_id, amount, status, gross_amount, retained_amount, net_amount, week_key)
       VALUES (?, ?, 'Pending', ?, ?, ?, ?)`
    )
    .run(user.id, net, gross, retained, net, wk);

  await db
    .prepare(
      `UPDATE users SET
         claims_this_month = claims_this_month + 1,
         wage_balance = 0,
         retained_balance = COALESCE(retained_balance, 0) + ?
       WHERE id = ?`
    )
    .run(retained, user.id);

  res.status(201).json({
    ok: true,
    weekKey: wk,
    gross,
    retained,
    amount: net,
    note: '20% retained · claim once per week'
  });
});

module.exports = router;
