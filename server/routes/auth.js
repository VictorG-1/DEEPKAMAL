const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const { starterPinFor, hashPin, verifyPin } = require('../lib/pins');
const { issueOtp, verifyOtp } = require('../lib/otp');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    initials: user.initials,
    avatarColor: user.avatar_color,
    jobTitle: user.job_title,
    team: user.team,
    phone: user.phone || null,
    dailyWage: user.daily_wage,
    availability: user.availability,
    kycStatus: user.kyc_status,
    wageBalance: user.wage_balance,
    retainedBalance: user.retained_balance || 0,
    claimsThisMonth: user.claims_this_month,
    engagementType: user.engagement_type || 'daily_wage',
    paymentLocked: Boolean(user.payment_locked),
    clientId: user.client_id,
    mustChangePassword: Boolean(user.must_change_password),
    hasPin: Boolean(user.pin_hash)
  };
}

function otpTargetFor(user) {
  if (user.phone) return { target: user.phone, channel: 'whatsapp' };
  if (user.email) return { target: user.email, channel: 'email' };
  return null;
}

function maskTarget(target) {
  const t = String(target || '');
  if (t.includes('@')) {
    const [u, d] = t.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  if (t.length > 4) return `***${t.slice(-4)}`;
  return '***';
}

async function authenticateCredentials(email, password, pin) {
  const user = await db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim());
  if (!user) return { error: 'Email or password is incorrect.' };

  let ok = false;
  if (password && bcrypt.compareSync(String(password), user.password_hash)) ok = true;
  if (!ok && pin && user.role === 'resource' && verifyPin(pin, user.pin_hash)) ok = true;
  if (!ok && password && user.role === 'resource' && /^\d{4,6}$/.test(String(password)) && verifyPin(password, user.pin_hash)) {
    ok = true;
  }
  if (!ok) return { error: 'Email or password / PIN is incorrect.' };
  return { user };
}

router.post('/login', async (req, res) => {
  const { email, password, pin, skipOtp } = req.body || {};
  if (!email || (!password && !pin)) {
    return res.status(400).json({ error: 'Email and password or PIN are required' });
  }

  const auth = await authenticateCredentials(email, password, pin);
  if (auth.error) return res.status(401).json({ error: auth.error });
  const user = auth.user;

  // Dev escape only when explicitly requested AND no SMS/email infra — still preferred path is OTP
  if (skipOtp === true && process.env.ALLOW_SKIP_LOGIN_OTP === '1') {
    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  }

  const dest = otpTargetFor(user);
  if (!dest) {
    // No phone/email on account — fall back to direct token (seed accounts)
    const token = signToken(user);
    return res.json({ token, user: publicUser(user), otpSkipped: true, reason: 'No phone/email on account' });
  }

  try {
    const issued = await issueOtp({
      purpose: 'login',
      target: dest.target,
      channel: dest.channel,
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
      subject: 'DeepKamal login OTP',
      bodyPrefix: 'Your DeepKamal login code is'
    });
    res.json({
      requiresOtp: true,
      purpose: 'login',
      targetMasked: maskTarget(dest.target),
      channel: dest.channel,
      userId: user.id,
      email: user.email,
      expiresAt: issued.expiresAt,
      ...(issued.devCode ? { devCode: issued.devCode } : {})
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not send OTP' });
  }
});

router.post('/verify-login-otp', async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email and OTP are required' });
  const user = await db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim());
  if (!user) return res.status(401).json({ error: 'Invalid session' });

  const dest = otpTargetFor(user);
  if (!dest) return res.status(400).json({ error: 'No OTP destination on account' });

  const check = await verifyOtp({
    purpose: 'login',
    target: dest.target,
    code,
    entityType: 'user',
    entityId: user.id
  });
  if (!check.ok) return res.status(401).json({ error: check.error });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post('/resend-login-otp', async (req, res) => {
  const { email, password, pin } = req.body || {};
  const auth = await authenticateCredentials(email, password, pin);
  if (auth.error) return res.status(401).json({ error: auth.error });
  const user = auth.user;
  const dest = otpTargetFor(user);
  if (!dest) return res.status(400).json({ error: 'No phone/email on account' });
  const issued = await issueOtp({
    purpose: 'login',
    target: dest.target,
    channel: dest.channel,
    userId: user.id,
    entityType: 'user',
    entityId: user.id,
    subject: 'DeepKamal login OTP',
    bodyPrefix: 'Your DeepKamal login code is'
  });
  res.json({
    ok: true,
    targetMasked: maskTarget(dest.target),
    expiresAt: issued.expiresAt,
    ...(issued.devCode ? { devCode: issued.devCode } : {})
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

router.get('/directory', async (_req, res) => {
  const people = (await db
    .prepare(
      `SELECT name, email, role, job_title FROM users
       WHERE role IN ('admin','manager','resource')
       ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, name`
    )
    .all())
    .map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      jobTitle: u.job_title
    }));
  res.json({ people });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.must_change_password) {
    if (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }
  await db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`).run(
    bcrypt.hashSync(String(newPassword), 10),
    user.id
  );
  res.json({ ok: true });
});

router.post('/set-pin', requireAuth, async (req, res) => {
  const { pin, currentPassword, currentPin } = req.body || {};
  if (!/^\d{4,6}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'PIN must be 4–6 digits' });
  }
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'resource' && !['admin', 'manager'].includes(user.role)) {
    return res.status(403).json({ error: 'PIN login is for field partners' });
  }
  if (user.pin_hash) {
    const okPass = currentPassword && bcrypt.compareSync(String(currentPassword), user.password_hash);
    const okPin = currentPin && verifyPin(currentPin, user.pin_hash);
    if (!okPass && !okPin) return res.status(401).json({ error: 'Confirm with current password or PIN' });
  }
  await db.prepare(`UPDATE users SET pin_hash = ?, login_pin_hint = ? WHERE id = ?`).run(
    hashPin(pin),
    `****${String(pin).slice(-2)}`,
    user.id
  );
  res.json({ ok: true, hint: `****${String(pin).slice(-2)}` });
});

/** Admin/manager reset a partner's PIN + force password change */
router.post('/reset-partner/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const user = await db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'resource'`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Partner not found' });
  const pin = starterPinFor(user.id, user.name);
  const tempPass = `DK${pin}!`;
  await db
    .prepare(
      `UPDATE users SET pin_hash = ?, login_pin_hint = ?, password_hash = ?, must_change_password = 1 WHERE id = ?`
    )
    .run(hashPin(pin), `****${pin.slice(-2)}`, bcrypt.hashSync(tempPass, 10), user.id);
  res.json({
    ok: true,
    partner: { id: user.id, name: user.name, email: user.email },
    pin,
    temporaryPassword: tempPass,
    note: 'Share PIN/password privately. Partner should change after first login.'
  });
});

module.exports = router;
module.exports.publicUser = publicUser;
