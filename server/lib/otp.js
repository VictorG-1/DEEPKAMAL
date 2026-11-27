const crypto = require('crypto');
const db = require('../db');
const { queueNotification } = require('./notify');
const { loadEnv } = require('./supabase');
const { combirdsConfigured, buildOtpMessage, normalizeIndianMobile } = require('./combirds-sms');

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function expiresInMinutes(mins = 10) {
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

function looksLikePhone(target) {
  return normalizeIndianMobile(target).ok || /^\+?\d{10,15}$/.test(String(target || '').replace(/\s/g, ''));
}

/**
 * Create + deliver OTP via Combirds SMS when configured.
 * Returns `devCode` only when SMS is not configured or delivery failed (so ops can still proceed).
 */
async function issueOtp({
  purpose,
  target,
  channel = null,
  entityType = null,
  entityId = null,
  userId = null,
  payload = null,
  subject = 'DeepKamal OTP',
  bodyPrefix = 'Your DeepKamal code is'
}) {
  if (!target) throw new Error('OTP destination missing (phone/email)');
  const code = generateCode();
  const expiresAt = expiresInMinutes(10);
  const result = await db
    .prepare(
      `INSERT INTO otp_codes (purpose, target, code_hash, entity_type, entity_id, user_id, payload, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      purpose,
      String(target).trim().toLowerCase(),
      hashCode(code),
      entityType,
      entityId,
      userId,
      payload ? JSON.stringify(payload) : null,
      expiresAt
    );

  const env = loadEnv();
  const phoneTarget = looksLikePhone(target);
  const preferSms = phoneTarget && combirdsConfigured();
  const resolvedChannel = channel || (preferSms ? 'sms' : phoneTarget ? 'whatsapp' : 'email');

  const smsBody = preferSms || resolvedChannel === 'sms' ? buildOtpMessage(code, env) : `${bodyPrefix} ${code}. Valid 10 minutes. Do not share.`;

  const notify = await queueNotification({
    channel: preferSms ? 'sms' : resolvedChannel,
    recipient: target,
    subject,
    body: smsBody,
    entityType: entityType || 'otp',
    entityId: entityId || result.lastInsertRowid,
    otpCode: code
  });

  const smsOk = preferSms && notify?.status === 'Sent';
  const demo = !combirdsConfigured() || !smsOk;

  return {
    otpId: result.lastInsertRowid,
    expiresAt,
    delivery: notify,
    channel: preferSms ? 'sms' : resolvedChannel,
    ...(demo ? { devCode: code } : {})
  };
}

async function verifyOtp({ purpose, target, code, entityType = null, entityId = null }) {
  if (!code || !/^\d{4,8}$/.test(String(code))) {
    return { ok: false, error: 'Enter the 6-digit OTP' };
  }
  const t = String(target).trim().toLowerCase();
  let row;
  if (entityType != null && entityId != null) {
    row = await db
      .prepare(
        `SELECT * FROM otp_codes
         WHERE purpose = ? AND target = ? AND entity_type = ? AND entity_id = ? AND used_at IS NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(purpose, t, entityType, entityId);
  } else {
    row = await db
      .prepare(
        `SELECT * FROM otp_codes
         WHERE purpose = ? AND target = ? AND used_at IS NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(purpose, t);
  }

  if (!row) return { ok: false, error: 'No active OTP. Request a new code.' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'OTP expired. Request a new code.' };
  }
  if (Number(row.attempts || 0) >= 5) {
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }

  await db.prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`).run(row.id);
  if (row.code_hash !== hashCode(code)) {
    return { ok: false, error: 'Incorrect OTP' };
  }

  await db.prepare(`UPDATE otp_codes SET used_at = datetime('now') WHERE id = ?`).run(row.id);
  return { ok: true, otp: row };
}

function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

module.exports = { issueOtp, verifyOtp, weekKey, hashCode, generateCode };
