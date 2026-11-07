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

function recalcWageBalance(userId, month = monthKey(new Date().toISOString().slice(0, 10))) {
  const user = db.prepare('SELECT id, daily_wage FROM users WHERE id = ?').get(userId);
  if (!user) return 0;
  const days = db
    .prepare(`SELECT status FROM attendance WHERE user_id = ? AND strftime('%Y-%m', date) = ?`)
    .all(userId, month);
  let earned = 0;
  for (const d of days) earned += creditFor(d.status, user.daily_wage);
  const claimed = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM salary_claims
       WHERE user_id = ? AND status IN ('Pending','Approved','Paid')
         AND strftime('%Y-%m', created_at) = ?`
    )
    .get(userId, month).s;
  const balance = Math.max(0, Math.round((earned - Number(claimed)) * 100) / 100);
  db.prepare(`UPDATE users SET wage_balance = ? WHERE id = ?`).run(balance, userId);
  return balance;
}

function upsertAttendance(userId, status, day, { siteId = null, latitude = null, longitude = null, accuracy = null } = {}) {
  const user = db.prepare('SELECT id, daily_wage FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const checkIn =
    latitude != null && longitude != null ? new Date().toISOString() : null;

  db.prepare(`
    INSERT INTO attendance (user_id, date, status, site_id, latitude, longitude, check_in_at, geo_accuracy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      status = excluded.status,
      site_id = COALESCE(excluded.site_id, attendance.site_id),
      latitude = COALESCE(excluded.latitude, attendance.latitude),
      longitude = COALESCE(excluded.longitude, attendance.longitude),
      check_in_at = COALESCE(excluded.check_in_at, attendance.check_in_at),
      geo_accuracy = COALESCE(excluded.geo_accuracy, attendance.geo_accuracy)
  `).run(userId, day, status, siteId, latitude, longitude, checkIn, accuracy);

  if (latitude != null && longitude != null) {
    db.prepare(`UPDATE users SET home_lat = ?, home_lng = ? WHERE id = ?`).run(latitude, longitude, userId);
  }

  recalcWageBalance(userId, monthKey(day));

  if (status === 'Present' || status === 'Half day') {
    db.prepare(`UPDATE users SET availability = 'On site' WHERE id = ?`).run(userId);
  } else if (status === 'Absent') {
    db.prepare(`UPDATE users SET availability = 'Available' WHERE id = ? AND availability = 'On site'`).run(userId);
  }
}

router.get('/', requireAuth, requireRole('admin', 'manager', 'resource'), (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  let resources = db
    .prepare(
      `SELECT id, name, initials, avatar_color, job_title, daily_wage, wage_balance, claims_this_month
       FROM users WHERE role = 'resource' ORDER BY name`
    )
    .all();
  if (req.user.role === 'resource') {
    resources = resources.filter((r) => r.id === req.user.id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = resources.map((r) => {
    const days = db
      .prepare(`SELECT status FROM attendance WHERE user_id = ? AND strftime('%Y-%m', date) = ?`)
      .all(r.id, month);

    let presentDays = 0;
    for (const d of days) {
      if (d.status === 'Present') presentDays += 1;
      if (d.status === 'Half day') presentDays += 0.5;
    }

    const todayRow = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(r.id, today);
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
  });

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

router.post('/', requireAuth, requireRole('admin', 'manager', 'resource'), (req, res) => {
  const { userId, status, siteId, date, markAll, latitude, longitude, accuracy } = req.body || {};
  const day = date || new Date().toISOString().slice(0, 10);

  if (!status || !['Present', 'Half day', 'Absent'].includes(status)) {
    return res.status(400).json({ error: 'Valid status is required (Present, Half day, Absent)' });
  }

  if (markAll && ['admin', 'manager'].includes(req.user.role)) {
    const team = db.prepare(`SELECT id FROM users WHERE role = 'resource'`).all();
    db.transaction(() => {
      for (const u of team) upsertAttendance(u.id, status, day, { siteId: siteId || null });
    })();
    return res.status(201).json({ ok: true, date: day, marked: team.length, status, markAll: true });
  }

  const targetId = req.user.role === 'resource' ? req.user.id : Number(userId);
  if (!targetId) return res.status(400).json({ error: 'userId is required' });

  // Partners must share GPS when marking Present / Half day
  if (
    req.user.role === 'resource' &&
    (status === 'Present' || status === 'Half day') &&
    (latitude == null || longitude == null || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude)))
  ) {
    return res.status(400).json({
      error: 'GPS check-in required. Allow location access, then mark Present again.'
    });
  }

  upsertAttendance(targetId, status, day, {
    siteId: siteId || null,
    latitude: latitude != null ? Number(latitude) : null,
    longitude: longitude != null ? Number(longitude) : null,
    accuracy: accuracy != null ? Number(accuracy) : null
  });
  const wageBalance = recalcWageBalance(targetId, monthKey(day));
  const row = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(targetId, day);
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

router.post('/claim', requireAuth, requireRole('resource'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const wageBalance = recalcWageBalance(user.id);
  if (user.claims_this_month >= 3) {
    return res.status(400).json({ error: 'You have reached the maximum of 3 salary claims this month.' });
  }
  if (!wageBalance || wageBalance <= 0) {
    return res.status(400).json({ error: 'No wage balance yet. Mark attendance Present to accrue wages.' });
  }

  const amount = wageBalance;
  db.prepare(`INSERT INTO salary_claims (user_id, amount, status) VALUES (?, ?, 'Pending')`).run(user.id, amount);
  db.prepare(`UPDATE users SET claims_this_month = claims_this_month + 1, wage_balance = 0 WHERE id = ?`).run(user.id);

  res.status(201).json({
    ok: true,
    amount,
    claimsRemaining: 3 - (user.claims_this_month + 1)
  });
});

module.exports = router;
