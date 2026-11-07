const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PAYMENT =
  '40% advance against PO / accepted quotation · 40% on material delivery at site · 20% on completion & handover';
const DEFAULT_DELIVERY =
  'Materials supplied as per site progress · Installation schedule agreed after kickoff · Lead time 7–14 working days for stocked items';
const DEFAULT_WARRANTY =
  '12 months on workmanship from handover · Manufacturer warranty on bought-out items · Free service call for defects attributable to installation';
const DEFAULT_EXCLUSIONS =
  'Civil cutting / chasing / scaffolding unless listed · Statutory fees & third-party inspection charges · Extra work beyond approved BOQ · Power / water at site by client';
const DEFAULT_NOTES =
  'Rates are indicative and valid for the period stated · Quantities as per site survey / BOQ · GST extra as applicable unless stated inclusive · Any price variation in copper / steel may be revised with mutual consent';

function hsnFor(category, fallback) {
  if (fallback) return fallback;
  const c = String(category || '');
  if (/Wire|Cable/i.test(c)) return '8544';
  if (/Conduit Pipe/i.test(c)) return '3917';
  if (/Conduit Fitting/i.test(c)) return '3917';
  if (/Fire & Water Pipe|Pipe Fitting/i.test(c)) return '7306';
  if (/Switchgear|Distribution|Switch/i.test(c)) return '8536';
  if (/Lighting/i.test(c)) return '9405';
  if (/Fire Alarm|Fire Fighting|Extinguisher/i.test(c)) return '8424';
  if (/Cable Management|Earthing|Hardware/i.test(c)) return '8536';
  if (/Labour/i.test(c)) return '998719';
  return '8536';
}

function nextQuoteCode() {
  const row = db.prepare(`SELECT code FROM quotations ORDER BY id DESC LIMIT 1`).get();
  const n = row ? parseInt(String(row.code).replace(/\D/g, ''), 10) + 1 : 1049;
  return `Q-${n}`;
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const select = `
  SELECT q.*, c.name AS client_name, c.location AS client_location, c.phone AS client_phone,
         c.email AS client_email, c.gstin AS client_gstin_master, c.address AS client_address,
         c.contact_person AS client_contact, s.name AS site_name, s.address AS site_addr
  FROM quotations q
  LEFT JOIN clients c ON c.id = q.client_id
  LEFT JOIN sites s ON s.id = q.site_id
`;

function getItems(quotationId) {
  return db
    .prepare(
      `SELECT qi.*, m.sku AS mat_sku, m.category AS mat_category, m.hsn AS mat_hsn
       FROM quotation_items qi
       LEFT JOIN materials m ON m.id = qi.material_id
       WHERE qi.quotation_id = ?
       ORDER BY qi.sort_order, qi.id`
    )
    .all(quotationId)
    .map((i) => ({
      id: i.id,
      materialId: i.material_id,
      sku: i.sku || i.mat_sku,
      category: i.category || i.mat_category,
      hsn: i.hsn || i.mat_hsn,
      description: i.description,
      specs: i.specs,
      unit: i.unit,
      qty: i.qty,
      rate: i.rate,
      gstPct: i.gst_pct ?? 18,
      taxAmount: i.tax_amount || 0,
      amount: i.amount
    }));
}

function moneyInr(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function mapQuote(q, withItems = false) {
  const items = withItems ? getItems(q.id) : undefined;
  const base = {
    id: q.id,
    code: q.code,
    revision: q.revision || 1,
    clientId: q.client_id,
    siteId: q.site_id,
    client: q.client_name
      ? `${q.client_name}${q.site_name ? ' · ' + q.site_name : q.client_location ? ' · ' + q.client_location : ''}`
      : '—',
    clientName: q.client_name,
    clientLocation: q.client_location,
    clientPhone: q.contact_phone || q.client_phone,
    clientEmail: q.contact_email || q.client_email,
    clientGstin: q.client_gstin || q.client_gstin_master,
    clientAddress: q.site_address || q.site_addr || q.client_address,
    title: q.title || q.scope,
    scope: q.scope,
    contactName: q.contact_name || q.client_contact,
    contactPhone: q.contact_phone || q.client_phone,
    contactEmail: q.contact_email || q.client_email,
    siteAddress: q.site_address || q.site_addr || q.client_address,
    quoteDate: q.quote_date,
    validUntil: q.valid_until,
    paymentTerms: q.payment_terms,
    deliveryTerms: q.delivery_terms,
    warrantyTerms: q.warranty_terms,
    notes: q.notes,
    exclusions: q.exclusions,
    discountPct: q.discount_pct || 0,
    discountAmount: q.discount_amount || 0,
    subtotal: q.subtotal != null ? q.subtotal : q.amount,
    taxAmount: q.tax_amount || 0,
    roundOff: q.round_off || 0,
    amount: q.amount,
    firstPayment: q.first_payment || 0,
    amountPaid: q.amount_paid || 0,
    balance: Math.round(Math.max(0, Number(q.amount || 0) - Number(q.amount_paid || 0)) * 100) / 100,
    ticketId: q.ticket_id || null,
    convertedAt: q.converted_at || null,
    gstMode: q.gst_mode || 'exclusive',
    placeOfSupply: q.place_of_supply,
    companyGstin: q.company_gstin,
    status: q.status,
    preparedBy: q.prepared_by_name,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    itemCount: db.prepare(`SELECT COUNT(*) AS c FROM quotation_items WHERE quotation_id = ?`).get(q.id).c
  };
  if (withItems) {
    base.items = items;
    base.totals = summarize(items, base);
  }
  return base;
}

function summarize(items, meta = {}) {
  const taxable = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const tax = items.reduce((s, i) => s + Number(i.taxAmount || 0), 0);
  const discountAmount = Number(meta.discountAmount || 0);
  const afterDiscount = Math.max(0, taxable - discountAmount);
  const taxAfter =
    meta.gstMode === 'inclusive'
      ? tax
      : items.reduce((s, i) => {
          const share = taxable ? Number(i.amount || 0) / taxable : 0;
          const lineAfter = Number(i.amount || 0) - discountAmount * share;
          return s + (lineAfter * Number(i.gstPct || 18)) / 100;
        }, 0);
  const raw = meta.gstMode === 'inclusive' ? afterDiscount : afterDiscount + taxAfter;
  const roundOff = Math.round(raw) - raw;
  const grand = Math.round(raw * 100) / 100;
  return {
    lineCount: items.length,
    taxable: Math.round(taxable * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxAmount: Math.round(taxAfter * 100) / 100,
    roundOff: Math.round(roundOff * 100) / 100,
    grandTotal: grand,
    cgst: Math.round((taxAfter / 2) * 100) / 100,
    sgst: Math.round((taxAfter / 2) * 100) / 100
  };
}

function resolveLines(rawItems, gstMode = 'exclusive') {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw Object.assign(new Error('Add at least one material / labour line'), { status: 400 });
  }
  return rawItems.map((item, idx) => {
    let material = null;
    if (item.materialId) {
      material = db.prepare('SELECT * FROM materials WHERE id = ? AND active = 1').get(item.materialId);
      if (!material) throw Object.assign(new Error(`Material not found: ${item.materialId}`), { status: 400 });
    }
    const description = String(item.description || material?.name || '').trim();
    if (!description) throw Object.assign(new Error('Each line needs a description'), { status: 400 });
    const qty = Number(item.qty);
    const rate = item.rate != null ? Number(item.rate) : Number(material?.rate || 0);
    if (!(qty > 0)) throw Object.assign(new Error('Quantity must be greater than 0'), { status: 400 });
    const gstPct = item.gstPct != null ? Number(item.gstPct) : Number(material?.gst_pct ?? 18);
    const amount = Math.round(qty * rate * 100) / 100;
    const taxAmount =
      gstMode === 'inclusive'
        ? Math.round(((amount * gstPct) / (100 + gstPct)) * 100) / 100
        : Math.round(((amount * gstPct) / 100) * 100) / 100;
    const category = item.category || material?.category || null;
    return {
      materialId: material?.id || null,
      sku: item.sku || material?.sku || null,
      category,
      hsn: item.hsn || material?.hsn || hsnFor(category),
      description,
      specs: item.specs || material?.description || null,
      unit: item.unit || material?.unit || 'Nos',
      qty,
      rate,
      gstPct,
      taxAmount,
      amount,
      sortOrder: idx
    };
  });
}

function computeTotals(lines, body = {}) {
  const discountPct = Number(body.discountPct) || 0;
  const taxable = lines.reduce((s, l) => s + l.amount, 0);
  const discountAmount =
    body.discountAmount != null && body.discountAmount !== ''
      ? Number(body.discountAmount)
      : Math.round(((taxable * discountPct) / 100) * 100) / 100;
  const gstMode = body.gstMode === 'inclusive' ? 'inclusive' : 'exclusive';
  const meta = { discountAmount, gstMode };
  const totals = summarize(
    lines.map((l) => ({ amount: l.amount, gstPct: l.gstPct, taxAmount: l.taxAmount })),
    meta
  );
  return { ...totals, discountPct, discountAmount, gstMode };
}

router.get('/', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'customer') {
    const user = db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    rows = db.prepare(`${select} WHERE q.client_id = ? ORDER BY q.id DESC`).all(user?.client_id || -1);
  } else {
    rows = db.prepare(`${select} ORDER BY q.id DESC`).all();
  }
  res.json({ quotations: rows.map((q) => mapQuote(q, false)) });
});

router.get('/:id', requireAuth, (req, res) => {
  const quote = db.prepare(`${select} WHERE q.id = ?`).get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found' });
  if (req.user.role === 'customer') {
    const user = db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
    if (quote.client_id !== user?.client_id) return res.status(403).json({ error: 'Not allowed' });
  }
  res.json({ quotation: mapQuote(quote, true) });
});

router.post('/', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  try {
    const body = req.body || {};
    const { clientId, siteId, items } = body;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    const lines = resolveLines(items, body.gstMode);
    const totals = computeTotals(lines, body);
    const scopeText =
      body.scope || body.title || `Material quotation · ${lines.length} line${lines.length === 1 ? '' : 's'}`;

    const insertQuote = db.prepare(`
      INSERT INTO quotations (
        code, client_id, site_id, scope, title, amount, first_payment, status, created_by,
        contact_name, contact_phone, contact_email, site_address, quote_date, valid_until,
        payment_terms, delivery_terms, warranty_terms, notes, exclusions,
        discount_pct, discount_amount, subtotal, tax_amount, round_off, gst_mode,
        place_of_supply, company_gstin, client_gstin, revision, prepared_by_name, updated_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?,?, datetime('now')
      )
    `);
    const insertItem = db.prepare(`
      INSERT INTO quotation_items (
        quotation_id, material_id, description, unit, qty, rate, amount, sort_order,
        sku, category, hsn, gst_pct, tax_amount, specs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const quoteId = db.transaction(() => {
      const code = nextQuoteCode();
      const result = insertQuote.run(
        code,
        clientId,
        siteId || null,
        scopeText,
        body.title || scopeText,
        totals.grandTotal,
        Number(body.firstPayment) || Math.round(totals.grandTotal * 0.4 * 100) / 100,
        body.status && ['Draft', 'Sent', 'Approved', 'Rejected'].includes(body.status) ? body.status : 'Sent',
        req.user.id,
        body.contactName || client.contact_person || null,
        body.contactPhone || client.phone || null,
        body.contactEmail || client.email || null,
        body.siteAddress || client.address || client.location || null,
        body.quoteDate || today(),
        body.validUntil || daysFromNow(30),
        body.paymentTerms || DEFAULT_PAYMENT,
        body.deliveryTerms || DEFAULT_DELIVERY,
        body.warrantyTerms || DEFAULT_WARRANTY,
        body.notes || DEFAULT_NOTES,
        body.exclusions || DEFAULT_EXCLUSIONS,
        totals.discountPct,
        totals.discountAmount,
        totals.taxable,
        totals.taxAmount,
        totals.roundOff,
        totals.gstMode,
        body.placeOfSupply || client.location || 'Maharashtra',
        body.companyGstin || '27AAAAA0000A1Z5',
        body.clientGstin || client.gstin || null,
        1,
        body.preparedBy || req.user.name
      );
      const id = result.lastInsertRowid;
      for (const line of lines) {
        insertItem.run(
          id,
          line.materialId,
          line.description,
          line.unit,
          line.qty,
          line.rate,
          line.amount,
          line.sortOrder,
          line.sku,
          line.category,
          line.hsn,
          line.gstPct,
          line.taxAmount,
          line.specs
        );
      }
      db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'quotation', ?)`)
        .run(req.user.id, `${req.user.name} created detailed quotation ${code} (${moneyInr(totals.grandTotal)})`, id);
      return id;
    })();

    const quote = db.prepare(`${select} WHERE q.id = ?`).get(quoteId);
    try {
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(quote.client_id);
      const { notifyQuoteSent } = require('../lib/notify');
      notifyQuoteSent(quote, client);
    } catch (_) {
      /* optional */
    }
    res.status(201).json({ quotation: mapQuote(quote, true) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create quotation' });
  }
});

router.put('/:id', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Quotation not found' });
    const body = req.body || {};
    const clientId = body.clientId || existing.client_id;
    const lines = resolveLines(body.items || getItems(existing.id).map((i) => ({
      materialId: i.materialId,
      description: i.description,
      unit: i.unit,
      qty: i.qty,
      rate: i.rate,
      gstPct: i.gstPct,
      hsn: i.hsn,
      specs: i.specs,
      sku: i.sku,
      category: i.category
    })), body.gstMode || existing.gst_mode);
    const totals = computeTotals(lines, {
      discountPct: body.discountPct != null ? body.discountPct : existing.discount_pct,
      discountAmount: body.discountAmount,
      gstMode: body.gstMode || existing.gst_mode
    });

    db.transaction(() => {
      db.prepare(`
        UPDATE quotations SET
          client_id = ?, site_id = ?, scope = ?, title = ?, amount = ?, first_payment = ?,
          contact_name = ?, contact_phone = ?, contact_email = ?, site_address = ?,
          quote_date = ?, valid_until = ?, payment_terms = ?, delivery_terms = ?, warranty_terms = ?,
          notes = ?, exclusions = ?, discount_pct = ?, discount_amount = ?, subtotal = ?,
          tax_amount = ?, round_off = ?, gst_mode = ?, place_of_supply = ?, company_gstin = ?,
          client_gstin = ?, revision = ?, prepared_by_name = ?, updated_at = datetime('now'),
          status = COALESCE(?, status)
        WHERE id = ?
      `).run(
        clientId,
        body.siteId !== undefined ? body.siteId : existing.site_id,
        body.scope || body.title || existing.scope,
        body.title || existing.title || existing.scope,
        totals.grandTotal,
        body.firstPayment != null ? Number(body.firstPayment) : existing.first_payment,
        body.contactName ?? existing.contact_name,
        body.contactPhone ?? existing.contact_phone,
        body.contactEmail ?? existing.contact_email,
        body.siteAddress ?? existing.site_address,
        body.quoteDate || existing.quote_date,
        body.validUntil || existing.valid_until,
        body.paymentTerms || existing.payment_terms,
        body.deliveryTerms || existing.delivery_terms,
        body.warrantyTerms || existing.warranty_terms,
        body.notes || existing.notes,
        body.exclusions || existing.exclusions,
        totals.discountPct,
        totals.discountAmount,
        totals.taxable,
        totals.taxAmount,
        totals.roundOff,
        totals.gstMode,
        body.placeOfSupply || existing.place_of_supply,
        body.companyGstin || existing.company_gstin,
        body.clientGstin || existing.client_gstin,
        (existing.revision || 1) + 1,
        body.preparedBy || existing.prepared_by_name,
        body.status && ['Draft', 'Sent', 'Approved', 'Rejected'].includes(body.status) ? body.status : null,
        existing.id
      );
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(existing.id);
      const insertItem = db.prepare(`
        INSERT INTO quotation_items (
          quotation_id, material_id, description, unit, qty, rate, amount, sort_order,
          sku, category, hsn, gst_pct, tax_amount, specs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const line of lines) {
        insertItem.run(
          existing.id,
          line.materialId,
          line.description,
          line.unit,
          line.qty,
          line.rate,
          line.amount,
          line.sortOrder,
          line.sku,
          line.category,
          line.hsn,
          line.gstPct,
          line.taxAmount,
          line.specs
        );
      }
    })();

    const quote = db.prepare(`${select} WHERE q.id = ?`).get(existing.id);
    res.json({ quotation: mapQuote(quote, true) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update quotation' });
  }
});

router.patch('/:id', requireAuth, requireRole('admin', 'manager', 'customer'), (req, res) => {
  try {
    const quote = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });

    if (req.user.role === 'customer') {
      const user = db.prepare('SELECT client_id FROM users WHERE id = ?').get(req.user.id);
      if (quote.client_id !== user?.client_id) return res.status(403).json({ error: 'Not allowed' });
    }

    const { status, convert } = req.body || {};
    if (!status || !['Draft', 'Sent', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required' });
    }
    if (req.user.role === 'customer' && !['Approved', 'Rejected'].includes(status)) {
      return res.status(403).json({ error: 'Customers can only approve or reject' });
    }

    db.prepare(`UPDATE quotations SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, quote.id);
    db.prepare(`INSERT INTO activity_log (user_id, message, entity_type, entity_id) VALUES (?, ?, 'quotation', ?)`)
      .run(req.user.id, `${req.user.name} marked ${quote.code} as ${status}`, quote.id);

    let conversion = null;
    if (status === 'Approved' && convert !== false) {
      const { convertQuotationToJob } = require('../lib/quote-convert');
      conversion = convertQuotationToJob(quote.id, req.user);
    }

    const updated = db.prepare(`${select} WHERE q.id = ?`).get(quote.id);
    res.json({ quotation: mapQuote(updated, true), conversion });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/convert', requireAuth, requireRole('admin', 'manager'), (req, res) => {
  try {
    db.prepare(`UPDATE quotations SET status = 'Approved', updated_at = datetime('now') WHERE id = ? AND status != 'Approved'`).run(
      req.params.id
    );
    const { convertQuotationToJob } = require('../lib/quote-convert');
    const conversion = convertQuotationToJob(Number(req.params.id), req.user);
    const updated = db.prepare(`${select} WHERE q.id = ?`).get(req.params.id);
    res.json({ quotation: mapQuote(updated, true), conversion });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.DEFAULT_PAYMENT = DEFAULT_PAYMENT;
module.exports.DEFAULT_DELIVERY = DEFAULT_DELIVERY;
module.exports.DEFAULT_WARRANTY = DEFAULT_WARRANTY;
module.exports.DEFAULT_EXCLUSIONS = DEFAULT_EXCLUSIONS;
module.exports.DEFAULT_NOTES = DEFAULT_NOTES;
