const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const { starterPinFor, hashPin, verifyPin } = require('../lib/pins');

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
    dailyWage: user.daily_wage,
    availability: user.availability,
    kycStatus: user.kyc_status,
    wageBalance: user.wage_balance,
    claimsThisMonth: user.claims_this_month,
    clientId: user.client_id,
    mustChangePassword: Boolean(user.must_change_password),
    hasPin: Boolean(user.pin_hash)
  };
}

router.post('/login', (req, res) => {
  const { email, password, pin, role } = req.body || {};
  if (!email || (!password && !pin)) {
    return res.status(400).json({ error: 'Email and password or PIN are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim());
  if (!user) return res.status(401).json({ error: 'Email or password is incorrect.' });

  let ok = false;
  if (password && bcrypt.compareSync(String(password), user.password_hash)) ok = true;
  if (!ok && pin && user.role === 'resource' && verifyPin(pin, user.pin_hash)) ok = true;
  // Allow partner to use PIN typed into password field when it looks like a 4–6 digit PIN
  if (!ok && password && user.role === 'resource' && /^\d{4,6}$/.test(String(password)) && verifyPin(password, user.pin_hash)) {
    ok = true;
  }
  if (!ok) return res.status(401).json({ error: 'Email or password / PIN is incorrect.' });

  if (role && user.role !== role) {
    // soft mismatch — still allow
  }

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

router.get('/directory', (_req, res) => {
  const people = db
    .prepare(
      `SELECT name, email, role, job_title FROM users
       WHERE role IN ('admin','manager','resource')
       ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, name`
    )
    .all()
    .map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      jobTitle: u.job_title
    }));
  res.json({ people });
});

/** Change own password */
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.must_change_password) {
    if (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }
  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`).run(
    bcrypt.hashSync(String(newPassword), 10),
    user.id
  );
  res.json({ ok: true });
});

/** Partner set / change 4–6 digit PIN */
router.post('/set-pin', requireAuth, (req, res) => {
  const { pin, currentPassword, currentPin } = req.body || {};
  if (!/^\d{4,6}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'PIN must be 4–6 digits' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'resource' && !['admin', 'manager'].includes(user.role)) {
    return res.status(403).json({ error: 'PIN login is for field partners' });
  }
  if (user.pin_hash) {
    const okPass = currentPassword && bcrypt.compareSync(String(currentPassword), user.password_hash);
    const okPin = currentPin && verifyPin(currentPin, user.pin_hash);
    if (!okPass && !okPin) return res.status(401).json({ error: 'Confirm with current password or PIN' });
  }
  db.prepare(`UPDATE users SET pin_hash = ?, login_pin_hint = ? WHERE id = ?`).run(
    hashPin(pin),
    `****${String(pin).slice(-2)}`,
    user.id
  );
  res.json({ ok: true, hint: `****${String(pin).slice(-2)}` });
});

/** Admin/manager reset a partner's PIN + force password change */
router.post('/reset-partner/:id', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'resource'`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Partner not found' });
  const pin = starterPinFor(user.id, user.name);
  const tempPass = `DK${pin}!`;
  db.prepare(
    `UPDATE users SET pin_hash = ?, login_pin_hint = ?, password_hash = ?, must_change_password = 1 WHERE id = ?`
  ).run(hashPin(pin), `****${pin.slice(-2)}`, bcrypt.hashSync(tempPass, 10), user.id);
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
