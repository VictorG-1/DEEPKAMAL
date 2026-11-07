const bcrypt = require('bcryptjs');

/** Deterministic starter PIN for a partner (never shared owner password). */
function starterPinFor(userId, name = '') {
  const n = Number(userId) || 0;
  const base = 1000 + ((n * 37 + (name || '').length * 11) % 9000);
  return String(base).padStart(4, '0');
}

function hashPin(pin) {
  return bcrypt.hashSync(String(pin), 10);
}

function verifyPin(pin, hash) {
  if (!pin || !hash) return false;
  try {
    return bcrypt.compareSync(String(pin), hash);
  } catch {
    return false;
  }
}

module.exports = { starterPinFor, hashPin, verifyPin };
