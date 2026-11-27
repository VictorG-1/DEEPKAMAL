const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const { starterPinFor, hashPin, verifyPin } = require('../lib/pins');
const { issueOtp, verifyOtp } = require('../lib/otp');
const { normalizeIndianMobile } = require('../lib/combirds-sms');

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

function requireTenDigitPhone(raw) {
  const n = normalizeIndianMobile(raw);
  if (!n.ok) return { error: 'Enter a valid 10-digit Indian mobile number' };
  return { phone: n.number };
}

function initialsFrom(name) {
  return String(name || 'DK')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'DK';
}

function otpTargetFor(user) {
  if (user.phone) {
    const n = normalizeIndianMobile(user.phone);
    return { target: n.ok ? n.number : user.phone, channel: 'sms' };
  }
  if (user.email) return { target: user.email, channel: 'email' };
  return null;
}

async function findUserByLogin(login) {
  const raw = String(login || '').trim();
  if (!raw) return null;
  const asPhone = normalizeIndianMobile(raw);
  if (asPhone.ok) {
    return await db.prepare('SELECT * FROM users WHERE phone = ?').get(asPhone.number);
  }
  return await db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(raw);
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

async function authenticateCredentials(login, password, pin) {
  const user = await findUserByLogin(login);
  if (!user) return { error: 'Email / phone or password is incorrect.' };

  let ok = false;
  if (password && bcrypt.compareSync(String(password), user.password_hash)) ok = true;
  if (!ok && pin && user.role === 'resource' && verifyPin(pin, user.pin_hash)) ok = true;
  if (!ok && password && user.role === 'resource' && /^\d{4,6}$/.test(String(password)) && verifyPin(password, user.pin_hash)) {
    ok = true;
  }
  if (!ok) return { error: 'Email / phone or password / PIN is incorrect.' };
  return { user };
}

async function beginLoginOtp(user, res) {
  const dest = otpTargetFor(user);
  if (!dest) {
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
    return res.json({
      requiresOtp: true,
      purpose: 'login',
      targetMasked: maskTarget(dest.target),
      channel: dest.channel,
      userId: user.id,
      email: user.email,
      phone: user.phone || null,
      expiresAt: issued.expiresAt,
      ...(issued.devCode ? { devCode: issued.devCode } : {})
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not send OTP' });
  }
}

router.post('/login', async (req, res) => {
  const { email, phone, password, pin, skipOtp } = req.body || {};
  const login = email || phone;
  if (!login || (!password && !pin)) {
    return res.status(400).json({ error: 'Email/phone and password or PIN are required' });
  }

  const auth = await authenticateCredentials(login, password, pin);
  if (auth.error) return res.status(401).json({ error: auth.error });
  const user = auth.user;

  // Dev escape only when explicitly requested AND no SMS/email infra — still preferred path is OTP
  if (skipOtp === true && process.env.ALLOW_SKIP_LOGIN_OTP === '1') {
    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  }

  return beginLoginOtp(user, res);
});

router.post('/verify-login-otp', async (req, res) => {
  const { email, phone, code } = req.body || {};
  const login = email || phone;
  if (!login || !code) return res.status(400).json({ error: 'Email/phone and OTP are required' });
  const user = await findUserByLogin(login);
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
  const { email, phone, password, pin } = req.body || {};
  const auth = await authenticateCredentials(email || phone, password, pin);
  if (auth.error) return res.status(401).json({ error: auth.error });
  return beginLoginOtp(auth.user, res);
});

/** Customer self-registration → user + client + site profiles */
router.post('/register/customer', async (req, res) => {
  const { name, phone, email, password, address, city } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  const phoneCheck = requireTenDigitPhone(phone);
  if (phoneCheck.error) return res.status(400).json({ error: phoneCheck.error });
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const phoneNum = phoneCheck.phone;
  const emailNorm = email
    ? String(email).trim().toLowerCase()
    : `c${phoneNum}@customers.deepkamal.in`;

  const existingPhone = await db.prepare('SELECT id FROM users WHERE phone = ?').get(phoneNum);
  if (existingPhone) return res.status(409).json({ error: 'This mobile is already registered' });
  const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(emailNorm);
  if (existingEmail) return res.status(409).json({ error: 'This email is already registered' });

  try {
    const clientIns = await db
      .prepare(
        `INSERT INTO clients (name, location, sites_count, amc_status, referral_code, phone, email, address, contact_person)
         VALUES (?, ?, 1, 'New', ?, ?, ?, ?, ?)`
      )
      .run(
        String(name).trim(),
        city || address || null,
        `C${phoneNum.slice(-6)}`,
        phoneNum,
        email ? emailNorm : null,
        address || null,
        String(name).trim()
      );
    const clientId = clientIns.lastInsertRowid;
    await db
      .prepare(`INSERT INTO sites (client_id, name, address, city) VALUES (?, 'Primary site', ?, ?)`)
      .run(clientId, address || null, city || null);

    const userIns = await db
      .prepare(
        `INSERT INTO users (
           email, password_hash, name, role, initials, avatar_color, job_title, phone, client_id, must_change_password
         ) VALUES (?, ?, ?, 'customer', ?, 'purple', 'Customer', ?, ?, 0)`
      )
      .run(
        emailNorm,
        bcrypt.hashSync(String(password), 10),
        String(name).trim(),
        initialsFrom(name),
        phoneNum,
        clientId
      );

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userIns.lastInsertRowid);
    await db
      .prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'user', ?)`)
      .run(user.id, `Customer registered · ${phoneNum}`, user.id);

    return beginLoginOtp(user, res);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE') || String(err.message || '').includes('unique')) {
      return res.status(409).json({ error: 'Mobile or email already registered' });
    }
    return res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

/** Partner self-registration → field resource profile */
router.post('/register/partner', async (req, res) => {
  const { name, phone, email, password, pin, team, engagementType } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  const phoneCheck = requireTenDigitPhone(phone);
  if (phoneCheck.error) return res.status(400).json({ error: phoneCheck.error });
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (pin && !/^\d{4,6}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN must be 4–6 digits' });
  }

  const phoneNum = phoneCheck.phone;
  const emailNorm = email
    ? String(email).trim().toLowerCase()
    : `p${phoneNum}@partners.deepkamal.in`;
  const eng = engagementType === 'contract' ? 'contract' : 'daily_wage';

  const existingPhone = await db.prepare('SELECT id FROM users WHERE phone = ?').get(phoneNum);
  if (existingPhone) return res.status(409).json({ error: 'This mobile is already registered' });
  const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(emailNorm);
  if (existingEmail) return res.status(409).json({ error: 'This email is already registered' });

  try {
    const pinValue = pin || starterPinFor(Date.now() % 9000, name);
    const userIns = await db
      .prepare(
        `INSERT INTO users (
           email, password_hash, name, role, initials, avatar_color, job_title, team, phone,
           daily_wage, availability, kyc_status, engagement_type, pin_hash, login_pin_hint, must_change_password
         ) VALUES (?, ?, ?, 'resource', ?, 'green', 'Field Technician', ?, ?, 1000, 'Available', 'Pending', ?, ?, ?, 0)`
      )
      .run(
        emailNorm,
        bcrypt.hashSync(String(password), 10),
        String(name).trim(),
        initialsFrom(name),
        team || 'Field',
        phoneNum,
        eng,
        hashPin(pinValue),
        `****${String(pinValue).slice(-2)}`
      );

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userIns.lastInsertRowid);
    await db
      .prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'user', ?)`)
      .run(user.id, `Partner registered · ${phoneNum} · ${eng}`, user.id);

    // Attach one-time PIN reveal on the OTP challenge response
    const dest = otpTargetFor(user);
    if (!dest) {
      const token = signToken(user);
      return res.status(201).json({
        token,
        user: publicUser(user),
        registered: true,
        starterPin: pin ? undefined : pinValue
      });
    }
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
    return res.status(201).json({
      requiresOtp: true,
      purpose: 'login',
      targetMasked: maskTarget(dest.target),
      channel: dest.channel,
      userId: user.id,
      email: user.email,
      phone: user.phone,
      registered: true,
      role: 'resource',
      starterPin: pin ? undefined : pinValue,
      expiresAt: issued.expiresAt,
      ...(issued.devCode ? { devCode: issued.devCode } : {})
    });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE') || String(err.message || '').includes('unique')) {
      return res.status(409).json({ error: 'Mobile or email already registered' });
    }
    return res.status(500).json({ error: err.message || 'Registration failed' });
  }
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
