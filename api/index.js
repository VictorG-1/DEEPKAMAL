/**
 * Vercel serverless entry — wraps the Express app.
 * Set DATABASE_URL (+ SUPABASE_*) in Vercel project env.
 */
process.env.VERCEL = process.env.VERCEL || '1';

const app = require('../server/app');

module.exports = app;
