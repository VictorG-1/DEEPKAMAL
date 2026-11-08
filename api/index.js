/**
 * Vercel serverless entry — wraps the Express app.
 * Required env (Project → Settings → Environment Variables):
 *   DATABASE_URL, JWT_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY
 */
process.env.VERCEL = process.env.VERCEL || '1';

let app;
try {
  app = require('../server/app');
} catch (err) {
  console.error('DeepKamal failed to load:', err);
  const express = require('express');
  app = express();
  app.use((req, res) => {
    res.status(500).json({
      error: 'DeepKamal failed to start',
      detail: String(err && err.message ? err.message : err),
      hint: 'Set DATABASE_URL (Supabase pooler) in Vercel environment variables, then redeploy.'
    });
  });
}

module.exports = app;
