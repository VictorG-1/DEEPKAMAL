const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin', 'manager'), (_req, res) => {
  const claims = db
    .prepare(
      `SELECT c.*, u.name AS user_name, u.initials, u.avatar_color
       FROM salary_claims c
       JOIN users u ON u.id = c.user_id
       WHERE c.status IN ('Pending','Approved')
       ORDER BY CASE c.status WHEN 'Pending' THEN 0 ELSE 1 END, c.created_at DESC`
    )
    .all()
    .map((c) => ({
      id: c.id,
      type: 'claim',
      title: `Salary claim · ${c.user_name}`,
      detail: `₹${Number(c.amount).toLocaleString('en-IN')} · ${c.status}`,
      amount: c.amount,
      status: c.status,
      userName: c.user_name,
      createdAt: c.created_at
    }));

  const evidence = db
    .prepare(
      `SELECT e.*, u.name AS user_name
       FROM work_evidence e
       LEFT JOIN users u ON u.id = e.user_id
       ORDER BY e.created_at DESC
       LIMIT 15`
    )
    .all()
    .map((e) => ({
      id: e.id,
      type: 'evidence',
      title: `Completion report · ${e.user_name || 'Field team'}`,
      detail: e.photo_path
        ? `Photo attached · ${e.captured_at || e.created_at}`
        : e.latitude != null
          ? `Geo ${Number(e.latitude).toFixed(4)}, ${Number(e.longitude).toFixed(4)}`
          : `Submitted ${e.captured_at || e.created_at}`,
      photoPath: e.photo_path,
      createdAt: e.created_at
    }));

  const amcSoon = db
    .prepare(
      `SELECT id, name, location, amc_status, amc_expires FROM clients
       WHERE amc_expires IS NOT NULL
         AND date(amc_expires) <= date('now', '+30 day')
       ORDER BY amc_expires`
    )
    .all()
    .map((c) => ({
      id: c.id,
      type: 'amc',
      title: `AMC renewal · ${c.name}`,
      detail: `Expires ${c.amc_expires} · ${c.location || ''} · ${c.amc_status || ''}`,
      createdAt: c.amc_expires
    }));

  res.json({
    approvals: [...claims.filter((c) => c.status === 'Pending'), ...amcSoon, ...evidence],
    pendingClaims: claims.filter((c) => c.status === 'Pending').length,
    approvedClaims: claims.filter((c) => c.status === 'Approved'),
    evidenceCount: evidence.length,
    amcAlerts: amcSoon.length
  });
});

router.post('/claims/:id/decide', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  const claim = db.prepare('SELECT * FROM salary_claims WHERE id = ?').get(req.params.id);
  if (!claim) return res.status(404).json({ error: 'Claim not found' });

  const action = String(req.body?.decision || 'approve').toLowerCase();

  if (action === 'pay') {
    if (claim.status !== 'Approved') {
      return res.status(400).json({ error: 'Approve the claim before marking Paid' });
    }
    db.prepare(`UPDATE salary_claims SET status = 'Paid' WHERE id = ?`).run(claim.id);
    db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'claim', ?)`)
      .run(req.user.id, `${req.user.name} paid salary claim #${claim.id} (₹${claim.amount})`, claim.id);
    return res.json({ ok: true, status: 'Paid' });
  }

  if (claim.status !== 'Pending') {
    return res.status(400).json({ error: 'Claim already decided' });
  }

  const decision = action === 'reject' ? 'Rejected' : 'Approved';
  db.prepare('UPDATE salary_claims SET status = ? WHERE id = ?').run(decision, claim.id);

  if (decision === 'Rejected') {
    db.prepare(`
      UPDATE users SET
        wage_balance = wage_balance + ?,
        claims_this_month = CASE WHEN claims_this_month > 0 THEN claims_this_month - 1 ELSE 0 END
      WHERE id = ?
    `).run(claim.amount, claim.user_id);
  }

  db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'claim', ?)`)
    .run(req.user.id, `${req.user.name} ${decision.toLowerCase()} salary claim #${claim.id}`, claim.id);

  res.json({ ok: true, status: decision });
});

module.exports = router;
