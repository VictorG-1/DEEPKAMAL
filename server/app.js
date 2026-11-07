/**
 * Express app (no listen). Used by local server, Vercel (api/index.js), Render/Railway.
 * Vercel requires DATABASE_URL → Supabase Postgres (SQLite is ephemeral on serverless).
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const db = require('./db');
const { ready: seedReady } = require('./seed');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const peopleRoutes = require('./routes/people');
const attendanceRoutes = require('./routes/attendance');
const clientRoutes = require('./routes/clients');
const serviceRoutes = require('./routes/services');
const quotationRoutes = require('./routes/quotations');
const materialRoutes = require('./routes/materials');
const bankRoutes = require('./routes/banks');
const dashboardRoutes = require('./routes/dashboard');
const feedbackRoutes = require('./routes/feedback');
const workRoutes = require('./routes/works');
const approvalRoutes = require('./routes/approvals');
const dbStatusRoutes = require('./routes/dbstatus');
const inventoryRoutes = require('./routes/inventory');
const paymentRoutes = require('./routes/payments');
const uploadRoutes = require('./routes/uploads');
const assetRoutes = require('./routes/assets');
const amcRoutes = require('./routes/amc');
const invoiceRoutes = require('./routes/invoices');
const vendorRoutes = require('./routes/vendors');
const razorpayRoutes = require('./routes/razorpay');
const notificationRoutes = require('./routes/notifications');
const offlineRoutes = require('./routes/offline');
const costingRoutes = require('./routes/costing');
const printRoutes = require('./routes/print');
const { status: supabaseStatus } = require('./lib/supabase');

const app = express();

// Express 4: forward rejected promises from async route handlers to error middleware
const Layer = require('express/lib/router/layer');
const _handle = Layer.prototype.handle_request;
Layer.prototype.handle_request = function patchedHandle(req, res, next) {
  const ret = _handle.call(this, req, res, next);
  if (ret && typeof ret.catch === 'function') ret.catch(next);
  return ret;
};

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(async (req, res, next) => {
  try {
    await seedReady;
    next();
  } catch (e) {
    next(e);
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.get('/favicon.ico', (_req, res) => {
  res.type('image/x-icon').sendFile(path.join(publicDir, 'favicon.ico'));
});
app.use(express.static(publicDir));

app.get('/api/health', async (_req, res) => {
  const users = Number((await db.prepare('SELECT COUNT(*) AS c FROM users').get()).c);
  const services = Number((await db.prepare('SELECT COUNT(*) AS c FROM services').get()).c);
  res.json({
    ok: true,
    service: 'DeepKamal API',
    time: new Date().toISOString(),
    database: db.dbPath,
    driver: db.driver || (db.USE_PG ? 'postgres' : 'sqlite'),
    users,
    services,
    supabase: supabaseStatus(),
    host: process.env.VERCEL
      ? 'vercel'
      : process.env.RENDER
        ? 'render'
        : process.env.RAILWAY_ENVIRONMENT
          ? 'railway'
          : 'node'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/amc', amcRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/offline', offlineRoutes);
app.use('/api/costing', costingRoutes);
app.use('/api/print', printRoutes);
app.use('/print', printRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/works', workRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/db', dbStatusRoutes);

app.get('/a/:token', (_req, res) => {
  res.sendFile(path.join(publicDir, 'asset-scan.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/print/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
