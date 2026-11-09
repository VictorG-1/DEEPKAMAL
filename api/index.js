/**
 * Vercel serverless entry.
 * Required env: DATABASE_URL, JWT_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY
 */
process.env.VERCEL = process.env.VERCEL || '1';

// Keep Node fetch on HTTP/1.1 for some Postgres poolers if needed
if (!process.env.VERCEL_FETCH_DISABLE_H2) {
  process.env.VERCEL_FETCH_DISABLE_H2 = '1';
}

let app;
try {
  app = require('../server/app');
} catch (err) {
  console.error('DeepKamal boot failure:', err);
  const express = require('express');
  app = express();
  app.all('*', (_req, res) => {
    res.status(500).type('application/json').send(
      JSON.stringify({
        error: 'DeepKamal failed to start',
        detail: String(err && err.message ? err.message : err),
        hint: 'Set DATABASE_URL + JWT_SECRET in Vercel → Settings → Environment Variables, then Redeploy.'
      })
    );
  });
}

module.exports = app;
