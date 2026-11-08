const path = require('path');
const fs = require('fs');

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTION_NAME
);

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (err) {
    // Vercel/Lambda filesystem is read-only except /tmp
    const fallback = path.join('/tmp', 'deepkamal', path.basename(dir));
    try {
      if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    } catch (_) {
      console.warn('Could not create directory:', dir, err.message);
      return dir;
    }
  }
}

function uploadsDir() {
  if (isServerless) return ensureDir(path.join('/tmp', 'deepkamal-uploads'));
  return ensureDir(path.join(__dirname, '..', '..', 'uploads'));
}

function publicDir() {
  return path.join(__dirname, '..', '..', 'public');
}

module.exports = { isServerless, ensureDir, uploadsDir, publicDir };
