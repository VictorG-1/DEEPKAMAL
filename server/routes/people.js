const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin', 'manager'), async (_req, res) => {
  const people = (await db.prepare(`
    SELECT id, name, email, phone, role, initials, avatar_color, job_title, team, availability, daily_wage,
           kyc_identity, kyc_bank, kyc_consent, kyc_status, wage_balance, claims_this_month,
           engagement_type, payment_locked, retained_balance
    FROM users
    WHERE role IN ('resource', 'manager', 'admin')
    ORDER BY
      CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
      name
  `).all()).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    initials: u.initials,
    avatarColor: u.avatar_color,
    jobTitle: u.job_title,
    team: u.team || '—',
    availability: u.availability,
    dailyWage: u.daily_wage,
    engagementType: u.engagement_type || 'daily_wage',
    paymentLocked: Boolean(u.payment_locked),
    retainedBalance: u.retained_balance || 0,
    kyc: {
      identity: u.kyc_identity,
      bank: u.kyc_bank,
      consent: u.kyc_consent,
      status: u.kyc_status
    },
    wageBalance: u.wage_balance,
    claimsThisMonth: u.claims_this_month
  }));
  res.json({ people });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, email, password, role, jobTitle, team, dailyWage } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  const safeRole = ['resource', 'manager', 'admin'].includes(role) ? role : 'resource';
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  try {
    const result = await db.prepare(`
      INSERT INTO users (email, password_hash, name, role, initials, job_title, team, daily_wage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      email.trim().toLowerCase(),
      bcrypt.hashSync(password, 10),
      name.trim(),
      safeRole,
      initials,
      jobTitle || null,
      team || null,
      dailyWage || 0
    );
    const user = await db.prepare('SELECT id, name, email, role, initials, job_title, team, daily_wage, availability FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ person: user });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw err;
  }
});

router.patch('/:id/kyc', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const { identity, bank, consent, status } = req.body || {};
  const user = await db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'resource');
  if (!user) return res.status(404).json({ error: 'Resource not found' });
  await db.prepare(`
    UPDATE users SET
      kyc_identity = COALESCE(?, kyc_identity),
      kyc_bank = COALESCE(?, kyc_bank),
      kyc_consent = COALESCE(?, kyc_consent),
      kyc_status = COALESCE(?, kyc_status)
    WHERE id = ?
  `).run(identity || null, bank || null, consent || null, status || null, user.id);
  res.json({ ok: true });
});

/** Superadmin: engagement type + payment lock toward partner */
router.patch('/:id/ops', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'resource'`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Partner not found' });
  const { engagementType, paymentLocked, dailyWage, phone } = req.body || {};
  const eng =
    engagementType === 'contract' || engagementType === 'daily_wage' ? engagementType : user.engagement_type || 'daily_wage';
  const locked = paymentLocked === undefined ? user.payment_locked : paymentLocked ? 1 : 0;
  await db
    .prepare(
      `UPDATE users SET
         engagement_type = ?,
         payment_locked = ?,
         daily_wage = COALESCE(?, daily_wage),
         phone = COALESCE(?, phone)
       WHERE id = ?`
    )
    .run(eng, locked, dailyWage != null ? Number(dailyWage) : null, phone || null, user.id);
  res.json({
    ok: true,
    engagementType: eng,
    paymentLocked: Boolean(locked),
    dailyWage: dailyWage != null ? Number(dailyWage) : user.daily_wage
  });
});

module.exports = router;
