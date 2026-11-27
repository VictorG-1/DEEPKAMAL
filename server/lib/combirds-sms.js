const { loadEnv } = require('./supabase');

function normalizeIndianMobile(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return { ok: false, error: `Invalid Indian mobile: ${raw}` };
  }
  return { ok: true, number: digits };
}

function buildOtpMessage(code, env) {
  const brand = env.COMBIRDS_TEMPLATE_FIRST_VAR || 'KMS';
  // DLT-approved pattern verified against Combirds: "Your KMS OTP is 123456"
  const custom = env.COMBIRDS_OTP_MESSAGE_TEMPLATE;
  if (custom) {
    return String(custom).replace(/\{otp\}/gi, code).replace(/\{brand\}/gi, brand).replace(/\{var1\}/gi, brand);
  }
  return `Your ${brand} OTP is ${code}`;
}

/**
 * Send transactional/OTP SMS via Combirds (smsapi.edumarcsms.com).
 */
async function sendCombirdsSms({ to, message, otpCode = null }) {
  const env = loadEnv();
  const apiKey = env.COMBIRDS_API_KEY || env.SMS_API_KEY;
  const senderId = env.COMBIRDS_SENDER_ID || 'TFLSTK';
  const templateId = env.COMBIRDS_TEMPLATE_ID || '';
  const base = (env.COMBIRDS_SMS_BASE_URL || 'https://smsapi.edumarcsms.com').replace(/\/$/, '');

  if (!apiKey) {
    return { ok: false, simulated: true, error: 'COMBIRDS_API_KEY not configured' };
  }

  const phone = normalizeIndianMobile(to);
  if (!phone.ok) return { ok: false, error: phone.error };

  const text = message || (otpCode ? buildOtpMessage(otpCode, env) : null);
  if (!text) return { ok: false, error: 'SMS message is required' };

  const path = env.COMBIRDS_SMS_PATH || '/api/v1/sms/send';
  const body = {
    number: phone.number,
    sender_id: senderId,
    message: text
  };
  if (templateId) body.template_id = String(templateId);

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  let res;
  let data;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(body)
    });
    const raw = await res.text();
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  } catch (err) {
    return { ok: false, error: err.message || 'Combirds request failed' };
  }

  const ok = res.ok && (data?.success === true || data?.data?.transactionId || data?.transactionId);
  return {
    ok: Boolean(ok),
    status: res.status,
    transactionId: data?.data?.transactionId || data?.transactionId || null,
    response: data,
    to: phone.number,
    senderId,
    templateId: templateId || null,
    message: text,
    error: ok ? null : data?.message || `Combirds HTTP ${res.status}`
  };
}

function combirdsConfigured() {
  const env = loadEnv();
  return Boolean(env.COMBIRDS_API_KEY || env.SMS_API_KEY);
}

module.exports = {
  sendCombirdsSms,
  combirdsConfigured,
  normalizeIndianMobile,
  buildOtpMessage
};
