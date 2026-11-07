const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), (_req, res) => {
  const accounts = db.prepare('SELECT * FROM bank_accounts ORDER BY id').all().map((b) => ({
    id: b.id,
    bank: b.bank_name,
    type: b.account_type,
    suffix: b.suffix,
    active: !!b.active
  }));
  res.json({ accounts, max: 10 });
});

router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM bank_accounts').get().c;
  if (count >= 10) {
    return res.status(400).json({ error: 'You can configure a maximum of 10 receiving bank accounts.' });
  }
  const { bank, type, suffix } = req.body || {};
  if (!bank || !suffix) {
    return res.status(400).json({ error: 'bank and suffix are required' });
  }
  const result = db.prepare(`
    INSERT INTO bank_accounts (bank_name, account_type, suffix, active)
    VALUES (?, ?, ?, 0)
  `).run(bank, type || 'Current account', String(suffix).slice(-4));
  const account = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    account: {
      id: account.id,
      bank: account.bank_name,
      type: account.account_type,
      suffix: account.suffix,
      active: false
    }
  });
});

router.post('/:id/activate', requireAuth, requireRole('admin'), (req, res) => {
  const account = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE bank_accounts SET active = 0').run();
    db.prepare('UPDATE bank_accounts SET active = 1 WHERE id = ?').run(account.id);
  });
  tx();

  const accounts = db.prepare('SELECT * FROM bank_accounts ORDER BY id').all().map((b) => ({
    id: b.id,
    bank: b.bank_name,
    type: b.account_type,
    suffix: b.suffix,
    active: !!b.active
  }));
  res.json({ accounts });
});

module.exports = router;
