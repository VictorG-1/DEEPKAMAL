/** Extra screens: inventory, works, banks, feedback, customer quotes, payments */
window.DKExtras = {
  renderInventory() {
    document.getElementById('eyebrow').textContent = 'Stores';
    document.getElementById('title').textContent = 'Inventory';
    document.getElementById('topCta').innerHTML = `
      <button class="btn-secondary" type="button" id="invReceive">Receive stock</button>
      <button class="btn-primary" type="button" id="invIssue">Issue to site</button>`;
    const stock = state.inventory || [];
    const mov = state.movements || [];
    return `
      <div class="metrics">
        <article class="metric"><span>SKUs</span><strong>${stock.length}</strong></article>
        <article class="metric"><span>Below reorder</span><strong>${stock.filter((s) => Number(s.qty) <= Number(s.reorderLevel ?? 50)).length}</strong></article>
      </div>
      <div class="panel table-wrap">
        <div class="panel-h"><div><h2>Stock on hand</h2><p>Wires, pipes, fittings — barcode ready</p></div></div>
        <table><thead><tr><th>Material</th><th>Qty</th><th>Rate</th><th>Barcode</th></tr></thead>
        <tbody>${stock
          .slice(0, 80)
          .map(
            (s) =>
              `<tr><td><strong>${esc(s.name)}</strong><div class="muted">${esc(s.sku)} · ${esc(s.category)}</div></td>
              <td><strong class="${s.qty <= 50 ? 'danger-text' : ''}">${s.qty}</strong> ${esc(s.unit)}</td>
              <td>${money(s.rate)}</td><td><code>${esc(s.barcode || '')}</code></td></tr>`
          )
          .join('')}</tbody></table>
      </div>
      <div class="panel">
        <div class="panel-h"><div><h2>Recent movements</h2></div></div>
        <div class="list">${mov
          .slice(0, 20)
          .map(
            (m) =>
              `<div class="row"><div><strong>${esc(m.direction)} · ${esc(m.material)}</strong><small>${esc(m.notes || m.site || '')} · ${esc(m.user || '')}</small></div><strong>${m.qty}</strong></div>`
          )
          .join('') || '<div class="empty"><h3>No movements yet</h3></div>'}</div>
      </div>`;
  },

  renderWorks() {
    document.getElementById('eyebrow').textContent = 'Projects';
    document.getElementById('title').textContent = 'Site works';
    document.getElementById('topCta').innerHTML = `<button class="btn-primary" type="button" id="addWork">+ Site work</button>`;
    const works = state.works || [];
    if (!works.length) return `<div class="panel empty"><h3>No active site works</h3><p>Create one, or approve a quotation to auto-create.</p></div>`;
    return `<div class="service-grid">${works
      .map(
        (w) => `<article class="service-card">
          <h3>${esc(w.title)}</h3>
          <p>${esc(w.client)} · ${esc(w.location || '')}</p>
          <p class="muted">Team ${esc(w.team || '—')} · Due ${esc(w.dueDate || '—')}</p>
          <div class="progress"><span style="width:${Number(w.progress) || 0}%"></span></div>
          <footer><span>${Number(w.progress) || 0}%</span>
            <button class="btn-secondary" type="button" data-work-prog="${w.id}">Update</button>
          </footer>
        </article>`
      )
      .join('')}</div>`;
  },

  renderBanks() {
    document.getElementById('eyebrow').textContent = 'Finance';
    document.getElementById('title').textContent = 'Bank accounts';
    document.getElementById('topCta').innerHTML = `<button class="btn-primary" type="button" id="addBank">+ Account</button>`;
    const accounts = state.banks || [];
    return `<div class="panel"><div class="list">${accounts
      .map(
        (b) =>
          `<div class="row"><div><strong>${esc(b.bank)}</strong><small>${esc(b.type)} · ****${esc(b.suffix)}</small></div>
          ${b.active ? badge('Active') : `<button class="btn-secondary" type="button" data-bank-act="${b.id}">Activate</button>`}</div>`
      )
      .join('') || '<div class="empty"><h3>No accounts</h3></div>'}</div></div>`;
  },

  renderFeedback() {
    document.getElementById('eyebrow').textContent = 'Voice of customer';
    document.getElementById('title').textContent = 'Feedback';
    document.getElementById('topCta').innerHTML = '';
    const rows = state.feedback || [];
    return `
      <div class="metrics"><article class="metric"><span>Average</span><strong>${esc(state.feedbackAvg || '—')}</strong></article>
      <article class="metric"><span>Reviews</span><strong>${rows.length}</strong></article></div>
      <div class="panel"><div class="list">${rows
        .map(
          (f) =>
            `<div class="row"><div><strong>${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</strong><small>${esc(f.customerName || '')} · ${esc(f.comment || '')}</small></div>${badge(f.recommend || '—')}</div>`
        )
        .join('') || '<div class="empty"><h3>No feedback yet</h3></div>'}</div></div>`;
  },

  renderCustomerQuotes() {
    document.getElementById('eyebrow').textContent = 'Commercial';
    document.getElementById('title').textContent = 'My quotations';
    document.getElementById('topCta').innerHTML = '';
    const rows = state.quotations || [];
    if (!rows.length) {
      return `<div class="panel empty"><h3>No quotations yet</h3><p>When DeepKamal sends a material quote to your account, it appears here for approval and advance payment.</p></div>`;
    }
    return `<div class="list panel">${rows
      .map(
        (q) => `<div class="row quote-row" data-open-quote="${q.id}">
          <div><strong>${esc(q.code)}</strong><small>${esc(q.title || q.scope)} · Due ${esc(q.validUntil || '—')}</small></div>
          <div><strong>${money(q.amount)}</strong> ${badge(q.status)}</div>
        </div>`
      )
      .join('')}</div>`;
  },

  renderAssets() {
    document.getElementById('eyebrow').textContent = 'Compliance';
    document.getElementById('title').textContent = 'Site assets';
    document.getElementById('topCta').innerHTML = `<button class="btn-primary" type="button" id="addAsset">+ Asset</button>`;
    const rows = state.assets || [];
    return `
      <div class="metrics">
        <article class="metric"><span>Assets</span><strong>${rows.length}</strong></article>
        <article class="metric"><span>Overdue / due</span><strong>${rows.filter((a) => a.overdue).length}</strong></article>
      </div>
      <div class="panel table-wrap"><table>
        <thead><tr><th>Asset</th><th>Site</th><th>Service</th><th>Refill</th><th>Hydro</th><th>Status</th><th>QR</th></tr></thead>
        <tbody>${rows
          .map(
            (a) => `<tr class="${a.overdue ? 'danger-text' : ''}">
            <td><strong>${esc(a.name)}</strong><div class="muted">${esc(a.assetType)} · ${esc(a.serialNo || '')}</div></td>
            <td>${esc(a.client)} · ${esc(a.site || '')}</td>
            <td>${esc(a.nextServiceDue || '—')}</td>
            <td>${esc(a.nextRefillDue || '—')}</td>
            <td>${esc(a.nextHydroDue || '—')}</td>
            <td>${badge(a.status)}</td>
            <td><button class="btn-secondary" type="button" data-asset-qr="${a.id}">Sticker</button></td></tr>`
          )
          .join('')}</tbody></table></div>`;
  },

  renderAmc() {
    document.getElementById('eyebrow').textContent = 'Compliance';
    document.getElementById('title').textContent = 'AMC calendar';
    document.getElementById('topCta').innerHTML = `
      <button class="btn-secondary" type="button" id="genAmc">Generate visits</button>`;
    const visits = state.amcVisits || [];
    return `<div class="panel table-wrap"><table>
      <thead><tr><th>Visit</th><th>Client</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${visits
        .map(
          (v) => `<tr>
          <td><strong>${esc(v.title)}</strong></td>
          <td>${esc(v.client)}</td>
          <td>${esc(v.dueDate)}</td>
          <td>${badge(v.status)}${v.ticketCode ? ` <small>${esc(v.ticketCode)}</small>` : ''}</td>
          <td>${v.status === 'Scheduled' ? `<button class="btn-primary" type="button" data-amc-ticket="${v.id}">Create ticket</button>` : ''}</td>
        </tr>`
        )
        .join('') || '<tr><td colspan="5">No visits — click Generate visits</td></tr>'}</tbody></table></div>`;
  },

  renderInvoices() {
    document.getElementById('eyebrow').textContent = 'Finance';
    document.getElementById('title').textContent = 'Invoices & AR';
    document.getElementById('topCta').innerHTML = '';
    const rows = state.invoices || [];
    return `
      <div class="metrics">
        <article class="metric"><span>Receivables</span><strong>${money(state.receivables || 0)}</strong></article>
        <article class="metric"><span>Invoices</span><strong>${rows.length}</strong></article>
      </div>
      <div class="panel table-wrap"><table>
        <thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Aging</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (i) => `<tr>
            <td><strong>${esc(i.code)}</strong><div class="muted">${badge(i.status)}</div></td>
            <td>${esc(i.client)}</td>
            <td>${esc(i.dueDate || '—')}</td>
            <td>${money(i.amount)}</td>
            <td>${money(i.amountPaid)}</td>
            <td><strong>${money(i.balance)}</strong></td>
            <td>${i.agingDays || 0}d</td>
            <td class="job-actions">
              <button class="btn-secondary" data-inv-pdf="${i.id}">PDF</button>
              ${['Unpaid', 'Partial'].includes(i.status) ? `<button class="btn-secondary" data-inv-pay="${i.id}">Pay</button>` : ''}
              ${i.status !== 'CreditNote' ? `<button class="btn-secondary" data-inv-cn="${i.id}">Credit note</button>` : ''}
            </td></tr>`
          )
          .join('')}</tbody></table></div>
      <div class="panel"><p class="muted" style="margin:0">Create a tax invoice from any approved quotation detail with <strong>Make invoice</strong>.</p></div>`;
  },

  renderProcurement() {
    document.getElementById('eyebrow').textContent = 'Stores';
    document.getElementById('title').textContent = 'Vendors & PO';
    document.getElementById('topCta').innerHTML = `
      <button class="btn-secondary" type="button" id="addVendor">+ Vendor</button>
      <button class="btn-primary" type="button" id="addPo">+ Purchase order</button>`;
    const vendors = state.vendors || [];
    const orders = state.purchaseOrders || [];
    const sug = state.reorderSuggestions || [];
    return `
      <div class="panel"><div class="panel-h"><div><h2>Reorder suggestions</h2><p>Below reorder level</p></div></div>
        <div class="list">${sug
          .slice(0, 8)
          .map(
            (s) =>
              `<div class="row"><div><strong>${esc(s.name)}</strong><small>${esc(s.sku)} · stock ${s.qty} / reorder ${s.reorderLevel}</small></div><span>Buy ${s.suggestQty}</span></div>`
          )
          .join('') || '<div class="empty"><h3>Stock healthy</h3></div>'}</div></div>
      <div class="panel"><div class="panel-h"><div><h2>Vendors</h2></div></div>
        <div class="list">${vendors.map((v) => `<div class="row"><div><strong>${esc(v.name)}</strong><small>${esc(v.phone || '')} · ${esc(v.gstin || '')}</small></div></div>`).join('')}</div></div>
      <div class="panel table-wrap"><div class="panel-h"><div><h2>Purchase orders</h2></div></div>
        <table><thead><tr><th>PO</th><th>Vendor</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${orders
          .map(
            (p) => `<tr><td><strong>${esc(p.code)}</strong></td><td>${esc(p.vendor)}</td><td>${money(p.total)}</td><td>${badge(p.status)}</td>
            <td>${p.status !== 'Received' ? `<button class="btn-primary" data-grn="${p.id}">GRN receive</button>` : ''}</td></tr>`
          )
          .join('')}</tbody></table></div>`;
  },

  renderNotifications() {
    document.getElementById('eyebrow').textContent = 'Comms';
    document.getElementById('title').textContent = 'Notifications';
    document.getElementById('topCta').innerHTML = `
      <button class="btn-secondary" type="button" id="remindPay">Payment reminders</button>
      <button class="btn-secondary" type="button" id="remindAmc">AMC reminders</button>`;
    const rows = state.notifications || [];
    return `<div class="panel"><div class="list">${rows
      .map(
        (n) =>
          `<div class="row"><div><strong>${esc(n.channel)} · ${esc(n.subject || '')}</strong><small>${esc(n.recipient || '')} · ${esc(n.body)}</small></div>
          <div>${badge(n.status)}${n.link ? ` <a href="${esc(n.link)}" target="_blank" rel="noopener">Open</a>` : ''}</div></div>`
      )
      .join('') || '<div class="empty"><h3>No notifications yet</h3></div>'}</div></div>`;
  },

  renderCosting() {
    document.getElementById('eyebrow').textContent = 'Finance';
    document.getElementById('title').textContent = 'Job costing';
    document.getElementById('topCta').innerHTML = '';
    const rows = state.jobCosts || [];
    return `<div class="panel table-wrap"><table>
      <thead><tr><th>Job</th><th>Quoted</th><th>Material</th><th>Labour</th><th>Actual</th><th>Margin</th></tr></thead>
      <tbody>${rows
        .map(
          (c) => `<tr>
          <td><strong>${esc(c.code)}</strong><div class="muted">${esc(c.title)}</div></td>
          <td>${money(c.quotedAmount)}</td><td>${money(c.materialCost)}</td><td>${money(c.labourCost)}</td>
          <td>${money(c.actualTotal)}</td>
          <td><strong class="${c.margin < 0 ? 'danger-text' : ''}">${money(c.margin)} ${c.marginPct != null ? `(${c.marginPct}%)` : ''}</strong></td>
        </tr>`
        )
        .join('')}</tbody></table></div>`;
  },

  bind() {
    document.getElementById('invReceive')?.addEventListener('click', () => this.stockSheet('receive'));
    document.getElementById('invIssue')?.addEventListener('click', () => this.stockSheet('issue'));
    document.getElementById('addWork')?.addEventListener('click', () => this.addWorkSheet());
    document.getElementById('addBank')?.addEventListener('click', () => this.addBankSheet());
    document.querySelectorAll('[data-bank-act]').forEach((btn) => {
      btn.onclick = async () => {
        state.banks = (await API.post(`/banks/${btn.dataset.bankAct}/activate`)).accounts;
        toast('Bank activated');
        render();
      };
    });
    document.querySelectorAll('[data-work-prog]').forEach((btn) => {
      btn.onclick = async () => {
        const progress = Number(prompt('Progress %', '50'));
        if (Number.isNaN(progress)) return;
        await API.patch(`/works/${btn.dataset.workProg}`, { progress });
        toast('Progress updated');
        await loadAll();
        render();
      };
    });
    document.getElementById('payQuote')?.addEventListener('click', async () => {
      const q = state.quoteDetail;
      if (!q) return;
      const amount = Number(prompt('Payment amount (INR)', String(q.firstPayment || q.balance || q.amount)));
      if (!(amount > 0)) return;
      try {
        const data = await API.post('/payments', {
          entityType: 'quotation',
          entityId: q.id,
          amount,
          method: 'UPI',
          reference: `ADV-${q.code}`
        });
        toast(`Paid ${money(amount)} · balance ${money(data.balance)}`);
        const fresh = await API.get(`/quotations/${q.id}`);
        state.quoteDetail = fresh.quotation;
        render();
      } catch (err) {
        toast(err.message);
      }
    });
    document.getElementById('convertQuote')?.addEventListener('click', async () => {
      try {
        const data = await API.post(`/quotations/${state.quoteViewId}/convert`);
        state.quoteDetail = data.quotation;
        toast(data.conversion?.ticketCode ? `Job ${data.conversion.ticketCode} created` : 'Converted');
        await loadAll();
        render();
      } catch (err) {
        toast(err.message);
      }
    });
    document.getElementById('makeInvoice')?.addEventListener('click', async () => {
      try {
        const data = await API.post(`/invoices/from-quotation/${state.quoteViewId}`);
        toast(`Invoice ${data.invoice.code} created`);
        state.view = 'invoices';
        await loadAll();
        render();
      } catch (err) {
        toast(err.message);
      }
    });
    document.getElementById('razorPay')?.addEventListener('click', async () => {
      try {
        const q = state.quoteDetail;
        const amount = Number(prompt('Pay amount', String(q?.balance || q?.firstPayment || q?.amount || 0)));
        if (!(amount > 0)) return;
        const order = await API.post('/razorpay/order', {
          entityType: 'quotation',
          entityId: q.id,
          amount
        });
        await API.post('/razorpay/confirm', { paymentId: order.paymentId, razorpayPaymentId: order.orderId });
        toast(order.demo ? `Demo Razorpay paid ${money(amount)}` : `Razorpay paid ${money(amount)}`);
        state.quoteDetail = (await API.get(`/quotations/${q.id}`)).quotation;
        render();
      } catch (err) {
        toast(err.message);
      }
    });
    document.getElementById('addAsset')?.addEventListener('click', () => this.assetSheet());
    document.getElementById('genAmc')?.addEventListener('click', async () => {
      const data = await API.post('/amc/generate');
      toast(`Created ${data.created} AMC visit(s)`);
      await loadAll();
      render();
    });
    document.querySelectorAll('[data-amc-ticket]').forEach((btn) => {
      btn.onclick = async () => {
        const data = await API.post(`/amc/visits/${btn.dataset.amcTicket}/ticket`);
        toast(`Ticket ${data.ticketCode}`);
        await loadAll();
        render();
      };
    });
    document.querySelectorAll('[data-inv-pay]').forEach((btn) => {
      btn.onclick = async () => {
        const amount = Number(prompt('Payment amount'));
        if (!(amount > 0)) return;
        await API.post(`/invoices/${btn.dataset.invPay}/pay`, { amount, method: 'UPI' });
        toast('Payment recorded');
        await loadAll();
        render();
      };
    });
    document.querySelectorAll('[data-inv-cn]').forEach((btn) => {
      btn.onclick = async () => {
        await API.post(`/invoices/${btn.dataset.invCn}/credit-note`, {});
        toast('Credit note created');
        await loadAll();
        render();
      };
    });
    document.getElementById('addVendor')?.addEventListener('click', () => this.vendorSheet());
    document.getElementById('addPo')?.addEventListener('click', () => this.poSheet());
    document.querySelectorAll('[data-grn]').forEach((btn) => {
      btn.onclick = async () => {
        const po = (state.purchaseOrders || []).find((p) => String(p.id) === btn.dataset.grn);
        if (!po) return;
        const items = (po.items || []).map((i) => ({ id: i.id, qty: Math.max(0, Number(i.qty) - Number(i.receivedQty || 0)) })).filter((i) => i.qty > 0);
        if (!items.length) return toast('Nothing left to receive');
        await API.post(`/vendors/orders/${po.id}/receive`, { items });
        toast('GRN posted to stock');
        await loadAll();
        render();
      };
    });
    document.getElementById('dbBackup')?.addEventListener('click', async () => {
      const data = await API.post('/db/backup');
      toast(`Backup saved (${Math.round(data.sizeBytes / 1024)} KB)`);
    });
    document.getElementById('remindPay')?.addEventListener('click', async () => {
      const data = await API.post('/notifications/reminders/payments');
      toast(`Queued ${data.notifications} payment reminder(s)`);
      await loadAll();
      render();
    });
    document.getElementById('remindAmc')?.addEventListener('click', async () => {
      const data = await API.post('/notifications/reminders/amc');
      toast(`Queued ${data.notifications} AMC reminder(s)`);
      await loadAll();
      render();
    });
    document.querySelectorAll('[data-asset-qr]').forEach((btn) => {
      btn.onclick = async () => {
        const data = await API.get(`/assets/${btn.dataset.assetQr}/sticker`);
        openSheet(`
          <h2>QR sticker</h2>
          <p class="meta">${esc(data.label)}</p>
          <img src="${esc(data.qrImage)}" alt="QR" width="240" height="240" style="display:block;margin:12px auto;background:#fff;padding:8px;border-radius:12px" />
          <p style="word-break:break-all;font-size:.85rem">${esc(data.url)}</p>
          <button class="btn-primary" type="button" id="openAssetScan" style="width:100%;margin-bottom:8px">Open scan page</button>
          <button class="btn-secondary" type="button" id="copyAssetUrl" style="width:100%">Copy link</button>`);
        document.getElementById('openAssetScan').onclick = () => window.open(data.url, '_blank');
        document.getElementById('copyAssetUrl').onclick = async () => {
          await navigator.clipboard.writeText(data.url);
          toast('Link copied — print QR for sticker');
        };
      };
    });
    document.querySelectorAll('[data-inv-pdf]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await DKField.sharePrint('invoice', Number(btn.dataset.invPdf));
        } catch (err) {
          toast(err.message);
        }
      };
    });
  },

  assetSheet() {
    openSheet(`
      <h2>Add site asset</h2>
      <form id="assetForm">
        <label>Client<select name="clientId" required>${(state.clients || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>Type<select name="assetType"><option>Extinguisher</option><option>Hydrant</option><option>Panel</option><option>Pump</option><option>Other</option></select></label>
        <label>Name<input name="name" required placeholder="ABC 6kg — Lobby" /></label>
        <label>Serial<input name="serialNo" /></label>
        <label>Location note<input name="locationNote" /></label>
        <label>Next service<input name="nextServiceDue" type="date" /></label>
        <label>Next refill<input name="nextRefillDue" type="date" /></label>
        <label>Next hydro<input name="nextHydroDue" type="date" /></label>
        <button class="btn-primary" type="submit" style="width:100%">Save asset</button>
      </form>`);
    document.getElementById('assetForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const clientId = Number(fd.get('clientId'));
      const client = state.clients.find((c) => c.id === clientId);
      await API.post('/assets', {
        clientId,
        siteId: client?.sites?.[0]?.id || null,
        assetType: fd.get('assetType'),
        name: fd.get('name'),
        serialNo: fd.get('serialNo'),
        locationNote: fd.get('locationNote'),
        nextServiceDue: fd.get('nextServiceDue') || null,
        nextRefillDue: fd.get('nextRefillDue') || null,
        nextHydroDue: fd.get('nextHydroDue') || null
      });
      closeSheet();
      toast('Asset saved');
      await loadAll();
      render();
    };
  },

  vendorSheet() {
    openSheet(`
      <h2>Add vendor</h2>
      <form id="vendorForm">
        <label>Name<input name="name" required /></label>
        <label>Phone<input name="phone" /></label>
        <label>Email<input name="email" /></label>
        <label>GSTIN<input name="gstin" /></label>
        <button class="btn-primary" type="submit" style="width:100%">Save</button>
      </form>`);
    document.getElementById('vendorForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await API.post('/vendors', Object.fromEntries(fd.entries()));
      closeSheet();
      toast('Vendor added');
      await loadAll();
      render();
    };
  },

  poSheet() {
    const sug = state.reorderSuggestions?.[0];
    openSheet(`
      <h2>New purchase order</h2>
      <form id="poForm">
        <label>Vendor<select name="vendorId" required>${(state.vendors || []).map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>
        <label>Material<select name="materialId">${(state.materials || []).slice(0, 100).map((m) => `<option value="${m.id}" ${sug && sug.materialId === m.id ? 'selected' : ''}>${esc(m.sku)} · ${esc(m.name)}</option>`).join('')}</select></label>
        <label>Qty<input name="qty" type="number" value="${sug?.suggestQty || 100}" /></label>
        <button class="btn-primary" type="submit" style="width:100%">Create PO</button>
      </form>`);
    document.getElementById('poForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const materialId = Number(fd.get('materialId'));
      const mat = state.materials.find((m) => m.id === materialId);
      const data = await API.post('/vendors/orders', {
        vendorId: Number(fd.get('vendorId')),
        items: [{ materialId, qty: Number(fd.get('qty')), rate: mat?.rate || 0, description: mat?.name }]
      });
      closeSheet();
      toast(`PO ${data.code || ''} created`);
      await loadAll();
      render();
    };
  },

  stockSheet(mode) {
    const mats = state.materials || [];
    openSheet(`
      <h2>${mode === 'receive' ? 'Receive stock' : 'Issue to site'}</h2>
      <form id="stockForm">
        <label>Material
          <select name="materialId" required>
            ${mats.slice(0, 200).map((m) => `<option value="${m.id}">${esc(m.sku)} · ${esc(m.name)}</option>`).join('')}
          </select>
        </label>
        <label>Qty<input name="qty" type="number" min="0.01" step="0.01" required value="10" /></label>
        ${
          mode === 'issue'
            ? `<label>Site
                <select name="siteId">
                  <option value="">—</option>
                  ${(state.clients || [])
                    .flatMap((c) => (c.sites || []).map((s) => ({ ...s, client: c.name })))
                    .map((s) => `<option value="${s.id}">${esc(s.client)} · ${esc(s.name)}</option>`)
                    .join('')}
                </select>
              </label>`
            : ''
        }
        <label>Notes<input name="notes" /></label>
        <button class="btn-primary" type="submit" style="width:100%">Save</button>
      </form>`);
    document.getElementById('stockForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        materialId: Number(fd.get('materialId')),
        qty: Number(fd.get('qty')),
        notes: fd.get('notes'),
        siteId: fd.get('siteId') ? Number(fd.get('siteId')) : null
      };
      await API.post(mode === 'receive' ? '/inventory/receive' : '/inventory/issue', body);
      closeSheet();
      toast(mode === 'receive' ? 'Stock received' : 'Stock issued');
      await loadAll();
      render();
    };
  },

  addWorkSheet() {
    openSheet(`
      <h2>New site work</h2>
      <form id="workForm">
        <label>Title<input name="title" required /></label>
        <label>Client
          <select name="clientId" required>
            ${(state.clients || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </label>
        <label>Team<input name="team" value="Field" /></label>
        <label>Due date<input name="dueDate" type="date" /></label>
        <button class="btn-primary" type="submit" style="width:100%">Create</button>
      </form>`);
    document.getElementById('workForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await API.post('/works', {
        title: fd.get('title'),
        clientId: Number(fd.get('clientId')),
        team: fd.get('team'),
        dueDate: fd.get('dueDate')
      });
      closeSheet();
      toast('Site work created');
      await loadAll();
      state.view = 'works';
      render();
    };
  },

  addBankSheet() {
    openSheet(`
      <h2>Add bank account</h2>
      <form id="bankForm">
        <label>Bank name<input name="bank" required /></label>
        <label>Type<input name="type" value="Current account" /></label>
        <label>Last 4 digits<input name="suffix" required maxlength="4" /></label>
        <button class="btn-primary" type="submit" style="width:100%">Save</button>
      </form>`);
    document.getElementById('bankForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await API.post('/banks', { bank: fd.get('bank'), type: fd.get('type'), suffix: fd.get('suffix') });
      closeSheet();
      toast('Bank added');
      state.banks = (await API.get('/banks')).accounts;
      render();
    };
  }
};
