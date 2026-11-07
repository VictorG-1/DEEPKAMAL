const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PASSWORD = 'DeepKamal@1';
const state = {
  view: 'home',
  categoryId: 'all',
  categories: [],
  services: [],
  orders: [],
  tickets: [],
  people: [],
  clients: [],
  attendance: [],
  works: [],
  approvals: [],
  dashboard: null,
  payrollTotal: 0,
  dbInfo: null,
  dispatch: null,
  quotations: [],
  materials: [],
  materialCategories: [],
  materialColors: [],
  materialCategory: 'all',
  materialColor: 'all',
  materialQuery: '',
  quoteLines: [],
  quoteMeta: defaultQuoteMeta(),
  quoteViewId: null,
  quoteDetail: null,
  inventory: [],
  movements: [],
  banks: [],
  feedback: [],
  feedbackAvg: null
};

function defaultQuoteMeta() {
  const d = new Date();
  const valid = new Date(d);
  valid.setDate(valid.getDate() + 30);
  return {
    clientId: '',
    title: '',
    scope: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    siteAddress: '',
    clientGstin: '',
    placeOfSupply: 'Maharashtra',
    quoteDate: d.toISOString().slice(0, 10),
    validUntil: valid.toISOString().slice(0, 10),
    discountPct: 0,
    firstPaymentPct: 40,
    gstMode: 'exclusive',
    paymentTerms:
      '40% advance against PO / accepted quotation · 40% on material delivery at site · 20% on completion & handover',
    deliveryTerms:
      'Materials supplied as per site progress · Installation schedule agreed after kickoff · Lead time 7–14 working days for stocked items',
    warrantyTerms:
      '12 months on workmanship from handover · Manufacturer warranty on bought-out items · Free service call for defects attributable to installation',
    notes:
      'Rates are indicative and valid for the period stated · Quantities as per site survey / BOQ · GST extra as applicable unless stated inclusive',
    exclusions:
      'Civil cutting / chasing / scaffolding unless listed · Statutory fees & third-party inspection charges · Extra work beyond approved BOQ · Power / water at site by client',
    status: 'Sent'
  };
}

const NAV = {
  admin: [
    ['home', 'Overview'],
    ['dispatch', 'Dispatch'],
    ['tickets', 'Tickets'],
    ['quotations', 'Quotations'],
    ['invoices', 'Invoices'],
    ['assets', 'Assets'],
    ['amc', 'AMC'],
    ['inventory', 'Inventory'],
    ['procurement', 'Vendors / PO'],
    ['costing', 'Job costing'],
    ['works', 'Site works'],
    ['people', 'Team'],
    ['clients', 'Clients'],
    ['services', 'Services'],
    ['orders', 'Bookings'],
    ['attendance', 'Attendance'],
    ['approvals', 'Approvals'],
    ['notifications', 'Alerts'],
    ['banks', 'Banks'],
    ['feedback', 'Feedback'],
    ['database', 'Database'],
    ['account', 'Account']
  ],
  manager: [
    ['home', 'Overview'],
    ['dispatch', 'Dispatch'],
    ['tickets', 'Tickets'],
    ['quotations', 'Quotations'],
    ['invoices', 'Invoices'],
    ['assets', 'Assets'],
    ['amc', 'AMC'],
    ['inventory', 'Inventory'],
    ['procurement', 'Vendors / PO'],
    ['costing', 'Job costing'],
    ['works', 'Site works'],
    ['people', 'Team'],
    ['clients', 'Clients'],
    ['orders', 'Bookings'],
    ['attendance', 'Attendance'],
    ['approvals', 'Approvals'],
    ['notifications', 'Alerts'],
    ['feedback', 'Feedback'],
    ['account', 'Account']
  ],
  resource: [
    ['home', 'Jobs'],
    ['attendance', 'Attendance'],
    ['orders', 'Bookings'],
    ['account', 'Account']
  ],
  customer: [
    ['home', 'Home'],
    ['services', 'Services'],
    ['quotations', 'Quotes'],
    ['invoices', 'Invoices'],
    ['orders', 'My bookings'],
    ['account', 'Account']
  ]
};

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2600);
}

function badge(status) {
  const s = String(status || '');
  const cls = /resolved|approved|verified|present|confirmed|paid|active/i.test(s)
    ? 'ok'
    : /critical|absent|reject|unassigned|action/i.test(s)
      ? 'danger'
      : /progress|pending|half|new|sent/i.test(s)
        ? 'warn'
        : 'neutral';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function openSheet(html) {
  document.getElementById('sheetBody').innerHTML = html;
  document.getElementById('sheet').hidden = false;
}
function closeSheet() {
  document.getElementById('sheet').hidden = true;
}
document.getElementById('sheetClose').onclick = closeSheet;
document.getElementById('sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet') closeSheet();
});

async function checkDb() {
  const el = document.getElementById('dbStatus');
  try {
    const res = await fetch('/api/db/status');
    const data = await res.json();
    state.dbInfo = data;
    if (data.ok) {
      el.textContent = `SQLite OK · ${data.counts.users} users · ${data.counts.services} services · ${Math.round(data.sizeBytes / 1024)} KB`;
      el.className = 'db-status ok';
      el.title = data.path;
    } else {
      el.textContent = data.error || 'Database error';
      el.className = 'db-status bad';
    }
  } catch {
    el.textContent = 'API offline — start with: npm run start:clean (must be localhost:3000, not Live Server)';
    el.className = 'db-status bad';
  }
}

async function doLogin(email, password, errorEl) {
  const data = await API.post('/auth/login', {
    email: String(email || '').trim(),
    password: String(password || '')
  });
  API.setSession(data.token, data.user);
  await enterApp();
}

document.querySelectorAll('.quick-login').forEach((btn) => {
  btn.onclick = async () => {
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.textContent = '';
    btn.classList.add('loading');
    try {
      await doLogin(btn.dataset.email, btn.dataset.pass || PASSWORD);
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
      else toast(err.message);
      btn.classList.remove('loading');
    }
  };
});

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  try {
    await doLogin(
      document.getElementById('loginEmail').value,
      document.getElementById('loginPassword').value
    );
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

function logout() {
  API.clearSession();
  location.href = '/';
}

  document.getElementById('logoutBtn').onclick = (e) => {
    e.stopPropagation();
    logout();
  };
  document.getElementById('side')?.querySelector('.side-user')?.addEventListener('click', (e) => {
    if (e.target.closest('#logoutBtn')) return;
    if (!API.user) return;
    state.view = 'account';
    document.getElementById('side').classList.remove('open');
    render();
  });
  document.getElementById('menuBtn').onclick = () => document.getElementById('side').classList.toggle('open');

async function loadAll() {
  const role = API.user.role;
  const tasks = [
    API.get('/dashboard').then((d) => (state.dashboard = d)),
    API.get('/tickets').then((d) => (state.tickets = d.tickets)),
    API.get('/services/catalog')
      .then((d) => {
        state.categories = d.categories || [];
        state.services = d.services || [];
      })
      .catch(async () => {
        const d = await API.get('/services');
        state.services = d.services || [];
        state.categories = [];
      }),
    API.get('/services/orders').then((d) => (state.orders = d.orders))
  ];
  if (role === 'admin' || role === 'manager') {
    tasks.push(
      API.get('/people').then((d) => (state.people = d.people)),
      API.get('/clients').then((d) => (state.clients = d.clients)),
      API.get('/attendance').then((d) => {
        state.attendance = d.attendance;
        state.payrollTotal = d.payrollTotal;
      }),
      API.get('/approvals').then((d) => {
        state.approvals = d.approvals || [];
        state.approvedClaims = d.approvedClaims || [];
      }),
      API.get('/tickets/dispatch').then((d) => (state.dispatch = d)),
      API.get('/works')
        .then((d) => (state.works = d.works))
        .catch(() => (state.works = state.dashboard?.works || [])),
      API.get('/quotations').then((d) => (state.quotations = d.quotations || [])),
      API.get('/materials').then((d) => {
        state.materials = d.materials || [];
        state.materialCategories = d.categories || [];
        state.materialColors = d.colors || [];
      }),
      API.get('/inventory')
        .then((d) => (state.inventory = d.stock || []))
        .catch(() => (state.inventory = [])),
      API.get('/inventory/movements')
        .then((d) => (state.movements = d.movements || []))
        .catch(() => (state.movements = [])),
      API.get('/works')
        .then((d) => (state.works = d.works || []))
        .catch(() => {}),
      API.get('/feedback')
        .then((d) => {
          state.feedback = d.feedback || [];
          state.feedbackAvg = d.average;
        })
        .catch(() => {}),
      API.get('/assets')
        .then((d) => (state.assets = d.assets || []))
        .catch(() => (state.assets = [])),
      API.get('/amc/visits')
        .then((d) => (state.amcVisits = d.visits || []))
        .catch(() => (state.amcVisits = [])),
      API.get('/invoices')
        .then((d) => {
          state.invoices = d.invoices || [];
          state.receivables = d.receivables || 0;
        })
        .catch(() => {
          state.invoices = [];
          state.receivables = 0;
        }),
      API.get('/vendors')
        .then((d) => (state.vendors = d.vendors || []))
        .catch(() => (state.vendors = [])),
      API.get('/vendors/orders')
        .then((d) => (state.purchaseOrders = d.orders || []))
        .catch(() => (state.purchaseOrders = [])),
      API.get('/vendors/reorder-suggestions')
        .then((d) => (state.reorderSuggestions = d.suggestions || []))
        .catch(() => (state.reorderSuggestions = [])),
      API.get('/notifications')
        .then((d) => (state.notifications = d.notifications || []))
        .catch(() => (state.notifications = [])),
      API.get('/costing')
        .then((d) => (state.jobCosts = d.costs || []))
        .catch(() => (state.jobCosts = [])),
      API.get('/razorpay/status')
        .then((d) => (state.razorpay = d))
        .catch(() => (state.razorpay = { mode: 'demo' }))
    );
  }
  if (role === 'admin') {
    tasks.push(API.get('/banks').then((d) => (state.banks = d.accounts || [])).catch(() => (state.banks = [])));
  }
  if (role === 'resource') {
    tasks.push(
      API.get('/tickets').then((d) => (state.tickets = d.tickets)),
      API.get('/attendance').then((d) => {
        state.attendance = d.attendance || [];
        state.payrollTotal = d.payrollTotal || 0;
      })
    );
  }
  if (role === 'customer') {
    tasks.push(
      API.get('/quotations')
        .then((d) => (state.quotations = d.quotations || []))
        .catch(() => (state.quotations = [])),
      API.get('/invoices')
        .then((d) => {
          state.invoices = d.invoices || [];
          state.receivables = d.receivables || 0;
        })
        .catch(() => {
          state.invoices = [];
          state.receivables = 0;
        })
    );
  }
  await Promise.all(tasks);
}

function setChrome() {
  const user = API.user;
  document.getElementById('whoName').textContent = user.name;
  document.getElementById('whoRole').textContent =
    user.role === 'admin' ? 'Owner' : user.role === 'manager' ? 'Manager' : user.role === 'resource' ? 'Partner' : 'Customer';
  const av = document.getElementById('avatar');
  av.textContent = user.initials || 'DK';

  const nav = document.getElementById('sideNav');
  const items = NAV[user.role] || NAV.admin;
  nav.innerHTML = items
    .map(([id, label]) => {
      const active =
        state.view === id || (id === 'quotations' && String(state.view).startsWith('quote'));
      return `<a href="#${id}" data-view="${id}" class="${active ? 'active' : ''}">${label}</a>`;
    })
    .join('');
  nav.querySelectorAll('[data-view]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      state.view = a.dataset.view;
      document.getElementById('side').classList.remove('open');
      render();
    };
  });

  const mobile = user.role === 'customer' || user.role === 'resource';
  document.getElementById('app').classList.toggle('mobile-tabs', mobile);
  const tab = document.getElementById('tabBar');
  if (mobile) {
    tab.hidden = false;
    const tabs =
      user.role === 'customer'
        ? [
            ['home', '🏠', 'Home'],
            ['services', '▦', 'Services'],
            ['quotations', '₹', 'Quotes'],
            ['orders', '▤', 'Bookings']
          ]
        : [
            ['home', '▦', 'Jobs'],
            ['attendance', '◷', 'Attendance'],
            ['orders', '▤', 'Bookings'],
            ['account', '♙', 'Account']
          ];
    tab.innerHTML = tabs
      .map(
        ([id, ico, label]) =>
          `<button type="button" data-view="${id}" class="${state.view === id ? 'active' : ''}"><span>${ico}</span>${label}</button>`
      )
      .join('');
    tab.querySelectorAll('[data-view]').forEach((b) => {
      b.onclick = () => {
        state.view = b.dataset.view;
        render();
      };
    });
  } else {
    tab.hidden = true;
  }
}

function bookService(service) {
  openSheet(`
    <h2>${esc(service.name)}</h2>
    <p class="meta">${esc(service.description || '')}<br><strong>${money(service.price)}</strong> · ~${service.durationMins || 60} mins</p>
    <form id="bookForm">
      <label>Service address<input name="address" required placeholder="Building, area, city" /></label>
      <label>Preferred slot
        <select name="slot">
          <option>Today · Morning</option>
          <option>Today · Afternoon</option>
          <option>Tomorrow · Morning</option>
          <option>Tomorrow · Afternoon</option>
        </select>
      </label>
      <button class="btn-primary" type="submit" style="width:100%">Confirm booking · ${money(service.price)}</button>
    </form>
  `);
  document.getElementById('bookForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await API.post('/services/orders', {
        serviceId: service.id,
        address: fd.get('address'),
        slot: fd.get('slot')
      });
      closeSheet();
      toast(`Booked ${data.order.code}`);
      await loadAll();
      state.view = 'orders';
      render();
    } catch (err) {
      toast(err.message);
    }
  };
}

function renderCustomerHome() {
  document.getElementById('eyebrow').textContent = 'Customer app';
  document.getElementById('title').textContent = 'Home';
  document.getElementById('topCta').innerHTML = '';
  const popular = state.services.slice(0, 6);
  return `
    <div class="hero-customer">
      <h2>Home services for electrical & fire safety</h2>
      <p>Choose a service, pick a slot, and DeepKamal dispatches a verified partner.</p>
    </div>
    <div class="chips">
      <button type="button" class="chip active" data-cat="all">All</button>
      ${state.categories.map((c) => `<button type="button" class="chip" data-cat="${c.id}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}
    </div>
    <div class="service-grid" id="svcGrid">
      ${
        popular.length
          ? popular
              .map(
                (s) => `<article class="service-card" data-sid="${s.id}">
            <div class="ico">${esc(s.icon || '◉')}</div>
            <h3>${esc(s.name)}</h3>
            <p>${esc(s.description || '')}</p>
            <footer><strong>${money(s.price)}</strong><button class="btn-secondary" type="button">Book</button></footer>
          </article>`
              )
              .join('')
          : '<div class="empty"><h3>No services yet</h3><p>Ask owner to publish the catalog.</p></div>'
      }
    </div>
  `;
}

function renderServices() {
  document.getElementById('eyebrow').textContent = 'Catalog';
  document.getElementById('title').textContent = 'Services';
  document.getElementById('topCta').innerHTML =
    API.user.role === 'admin' || API.user.role === 'manager'
      ? `<button class="btn-primary" type="button" id="addSvc">+ Add service</button>`
      : '';
  const filtered =
    state.categoryId === 'all'
      ? state.services
      : state.services.filter((s) => String(s.categoryId) === String(state.categoryId));
  return `
    <div class="chips">
      <button type="button" class="chip ${state.categoryId === 'all' ? 'active' : ''}" data-cat="all">All</button>
      ${state.categories
        .map(
          (c) =>
            `<button type="button" class="chip ${String(state.categoryId) === String(c.id) ? 'active' : ''}" data-cat="${c.id}">${esc(c.icon || '')} ${esc(c.name)}</button>`
        )
        .join('')}
    </div>
    <div class="service-grid">
      ${
        filtered.length
          ? filtered
              .map(
                (s) => `<article class="service-card" data-sid="${s.id}">
          <div class="ico">${esc(s.icon || '◉')}</div>
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.description || '')}</p>
          <footer><strong>${money(s.price)}</strong>${
            API.user.role === 'customer'
              ? '<button class="btn-secondary" type="button">Book</button>'
              : `<span class="badge neutral">${esc(s.category || 'Service')}</span>`
          }</footer>
        </article>`
              )
              .join('')
          : '<div class="empty"><h3>No services in this category</h3></div>'
      }
    </div>
  `;
}

function renderOrders() {
  document.getElementById('eyebrow').textContent = 'Bookings';
  document.getElementById('title').textContent = API.user.role === 'customer' ? 'My bookings' : 'All bookings';
  document.getElementById('topCta').innerHTML = '';
  if (!state.orders.length) {
    return `<div class="panel empty"><h3>No bookings yet</h3><p>Book a service from the catalog. Orders save to the database instantly.</p></div>`;
  }
  return `<div class="panel"><div class="list">${state.orders
    .map(
      (o) => `<div class="row"><div><strong>${esc(o.service)}</strong><small>${esc(o.code)} · ${esc(o.site)} · ${esc(o.slot || o.bookedAt)}</small></div><div>${badge(o.status)} <strong>${money(o.amount)}</strong></div></div>`
    )
    .join('')}</div></div>`;
}

function renderOpsHome() {
  const d = state.dashboard || { stats: {} };
  document.getElementById('eyebrow').textContent = 'Operations';
  document.getElementById('title').textContent = 'Overview';
  document.getElementById('topCta').innerHTML = `
    <button class="btn-secondary" type="button" id="goDispatch">Dispatch</button>
    <button class="btn-primary" type="button" id="newTicket">+ Ticket</button>`;
  const open = state.tickets.filter((t) => !['Resolved', 'Closed'].includes(t.status));
  const amc = d.amcDue || [];
  return `
    <div class="metrics">
      <article class="metric"><span>Open tickets</span><strong>${d.stats.openTickets || 0}</strong></article>
      <article class="metric"><span>Unassigned</span><strong>${d.stats.unassigned || 0}</strong></article>
      <article class="metric"><span>AMC due</span><strong>${d.stats.amcDue || 0}</strong></article>
      <article class="metric"><span>Low stock</span><strong>${d.stats.lowStock || 0}</strong></article>
      <article class="metric"><span>Claims</span><strong>${d.stats.pendingClaims || 0}</strong></article>
      <article class="metric"><span>Team online</span><strong>${d.stats.fieldOnline || 0}/${d.stats.fieldTotal || 0}</strong></article>
    </div>
    <div class="panel">
      <div class="panel-h"><div><h2>Needs attention</h2><p>Assign from Dispatch</p></div></div>
      ${
        open.length
          ? `<div class="list">${open
              .slice(0, 8)
              .map(
                (t) =>
                  `<div class="row"><div><strong>${esc(t.title)}</strong><small>${esc(t.code)} · ${esc(t.client)} · ${esc(t.person)}</small></div><div>${badge(t.priority)} ${badge(t.status)}</div></div>`
              )
              .join('')}</div>`
          : '<div class="empty"><h3>No open tickets</h3><p>Create a ticket or wait for a customer booking.</p></div>'
      }
    </div>
    ${
      amc.length
        ? `<div class="panel"><div class="panel-h"><div><h2>AMC renewals</h2><p>Expiring within 45 days</p></div></div>
        <div class="list">${amc
          .map(
            (c) =>
              `<div class="row"><div><strong>${esc(c.name)}</strong><small>${esc(c.location || '')}</small></div><span>${esc(c.expires)} ${badge(c.status)}</span></div>`
          )
          .join('')}</div></div>`
        : ''
    }
  `;
}

function renderDispatch() {
  document.getElementById('eyebrow').textContent = 'Field ops';
  document.getElementById('title').textContent = 'Dispatch';
  document.getElementById('topCta').innerHTML = `<button class="btn-primary" type="button" id="newTicket">+ Ticket</button>`;
  const board = state.dispatch || { unassigned: [], active: [], partners: [] };
  const partners = board.partners || state.people.filter((p) => p.role === 'resource');

  const assignControls = (ticketId) => `
    <div class="assign-row">
      <select data-partner-for="${ticketId}">
        <option value="">Select partner</option>
        ${partners
          .map((p) => `<option value="${p.id}">${esc(p.name)}${p.activeJobs != null ? ` (${p.activeJobs} jobs)` : ''}</option>`)
          .join('')}
      </select>
      <button class="btn-primary" type="button" data-assign="${ticketId}">Assign</button>
    </div>`;

  const mapJobs = board.mapJobs || [...(board.unassigned || []), ...(board.active || [])];
  return `
    <div class="metrics">
      <article class="metric"><span>Unassigned</span><strong>${board.unassigned?.length || 0}</strong></article>
      <article class="metric"><span>Active in field</span><strong>${board.active?.length || 0}</strong></article>
      <article class="metric"><span>Partners</span><strong>${partners.length}</strong></article>
    </div>
    <div class="panel">
      <div class="panel-h"><div><h2>Live map · ETA</h2><p>Open jobs from HQ · city traffic estimate</p></div></div>
      <div id="dispatchMap" class="dispatch-map"></div>
      <div class="list" style="margin-top:12px">${mapJobs
        .slice(0, 12)
        .map(
          (t) =>
            `<div class="row"><div><strong>${esc(t.code)}</strong><small>${esc(t.title)} · ${esc(t.client)}</small></div>
            <div>${t.map ? `<strong>${esc(t.map.etaLabel)}</strong> <span class="muted">${t.map.kmFromHq} km</span>` : '—'} ${badge(t.status)}</div></div>`
        )
        .join('') || '<div class="empty"><h3>No open jobs on map</h3></div>'}</div>
    </div>
    <div class="panel">
      <div class="panel-h"><div><h2>Unassigned queue</h2><p>Assign a partner to start the job</p></div></div>
      ${
        board.unassigned?.length
          ? `<div class="list">${board.unassigned
              .map(
                (t) => `<div class="job-card">
              <div class="row" style="border:0;padding:0 0 10px">
                <div><strong>${esc(t.title)}</strong><small>${esc(t.code)} · ${esc(t.client)} · ${badge(t.priority)}</small></div>
                ${badge(t.status)}
              </div>
              ${assignControls(t.id)}
            </div>`
              )
              .join('')}</div>`
          : '<div class="empty"><h3>Queue clear</h3><p>No unassigned tickets right now.</p></div>'
      }
    </div>
    <div class="panel">
      <div class="panel-h"><div><h2>Active jobs</h2><p>Assigned → On the way → In progress</p></div></div>
      ${
        board.active?.length
          ? `<div class="list">${board.active
              .map(
                (t) => `<div class="row"><div><strong>${esc(t.title)}</strong><small>${esc(t.code)} · ${esc(t.person)} · ${esc(t.client)}${t.map ? ` · ETA ${esc(t.map.etaLabel)}` : ''}</small></div>
                <div class="job-actions">${badge(t.status)}
                <button class="btn-secondary" type="button" data-ticket-chat="${t.id}">Notes</button></div></div>`
              )
              .join('')}</div>`
          : '<div class="empty"><h3>No active field jobs</h3></div>'
      }
    </div>
  `;
}

function renderPartnerHome() {
  document.getElementById('eyebrow').textContent = 'Partner app';
  document.getElementById('title').textContent = 'My jobs';
  document.getElementById('topCta').innerHTML = `
    <button class="btn-primary" type="button" id="markSelfPresent">Present today</button>
    <button class="btn-secondary" type="button" id="claimBtn">Claim wages</button>`;
  const d = state.dashboard?.resource || {};
  const mine = state.attendance?.find((a) => Number(a.id) === Number(API.user.id));
  const todayStatus = mine?.today || 'Not marked';
  const jobs =
    (d.activeJobs && d.activeJobs.length
      ? d.activeJobs
      : state.tickets.filter((t) => !['Resolved', 'Closed', 'Unassigned'].includes(t.status))) || [];

  return `
    <div class="partner-earn"><span>Wage balance (from attendance)</span><strong>${money(d.wageBalance || mine?.wageBalance || 0)}</strong></div>
    <div class="panel">
      <div class="panel-h"><div><h2>Today's attendance</h2><p>Mark before you start jobs</p></div>${badge(todayStatus)}</div>
      <div class="partner-att-actions job-actions">
        <button class="btn-primary" type="button" data-att-self="Present">Present today</button>
        <button class="btn-secondary" type="button" data-att-self="Half day">Half day</button>
        <button class="btn-secondary" type="button" data-att-self="Absent">Absent</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h"><div><h2>Assigned to you</h2><p>Start → On the way → Complete with GPS</p></div></div>
      ${
        jobs.length
          ? jobs
              .map((j) => {
                const status = j.status;
                let actions = '';
                if (status === 'Assigned') {
                  actions = `<button class="btn-primary" type="button" data-job-status="${j.id}" data-next="On the way">Start / On the way</button>`;
                } else if (status === 'On the way') {
                  actions = `<button class="btn-primary" type="button" data-job-status="${j.id}" data-next="In progress">Arrived / Start work</button>`;
                } else if (status === 'In progress') {
                  actions = `<button class="btn-primary" type="button" data-job-complete="${j.id}">Complete job</button>`;
                }
                return `<article class="job-card">
                  <div class="row" style="border:0;padding:0 0 8px">
                    <div><strong>${esc(j.title)}</strong><small>${esc(j.code)} · ${esc(j.client || '')} ${j.site ? '· ' + esc(j.site) : ''}</small></div>
                    ${badge(status)}
                  </div>
                  ${j.description ? `<p class="job-desc">${esc(j.description)}</p>` : ''}
                  <div class="job-actions">${actions}
                    <button class="btn-secondary" type="button" data-ticket-chat="${j.id}">Notes</button>
                  </div>
                </article>`;
              })
              .join('')
          : '<div class="empty"><h3>No jobs assigned</h3><p>When a manager dispatches a ticket to you, it appears here.</p></div>'
      }
    </div>
  `;
}

function renderTickets() {
  document.getElementById('eyebrow').textContent = 'Service desk';
  document.getElementById('title').textContent = 'Tickets';
  document.getElementById('topCta').innerHTML = `
    <button class="btn-secondary" type="button" id="goDispatch">Dispatch</button>
    <button class="btn-primary" type="button" id="newTicket">+ Ticket</button>`;
  if (!state.tickets.length) return `<div class="panel empty"><h3>No tickets in database</h3></div>`;
  return `<div class="panel table-wrap"><table><thead><tr><th>Ticket</th><th>Client / site</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${state.tickets
    .map((t) => {
      const canAssign = t.status === 'Unassigned' || !t.assignedUserId;
      return `<tr>
        <td><strong>${esc(t.code)}</strong><div>${esc(t.title)}</div>${t.description ? `<div class="muted">${esc(String(t.description).slice(0, 90))}</div>` : ''}</td>
        <td>${esc(t.client)}${t.siteName ? `<div class="muted">${esc(t.siteName)}</div>` : ''}</td>
        <td>${esc(t.person)}</td>
        <td>${badge(t.priority)}</td>
        <td>${badge(t.status)}</td>
        <td class="muted">${esc(t.updated || '—')}</td>
        <td class="job-actions">
          <button class="btn-secondary" type="button" data-ticket-chat="${t.id}">Notes</button>
          ${canAssign ? `<button class="btn-secondary" type="button" data-open-assign="${t.id}">Assign</button>` : ''}
        </td>
      </tr>`;
    })
    .join('')}</tbody></table></div>`;
}

function renderPeople() {
  document.getElementById('eyebrow').textContent = 'Workforce';
  document.getElementById('title').textContent = 'Team';
  document.getElementById('topCta').innerHTML = '';
  const rows = state.people.filter((p) => p.role !== 'customer');
  return `<div class="panel table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Availability</th><th>KYC</th><th>Access</th></tr></thead><tbody>${rows
    .map(
      (p) =>
        `<tr><td><strong>${esc(p.name)}</strong><div style="color:var(--muted);font-size:.8rem">${esc(p.email || '')}</div></td><td>${esc(p.jobTitle || p.role)}</td><td>${esc(p.team || '—')}</td><td>${badge(p.availability)}</td><td>${badge(p.kyc?.status || '—')}</td>
        <td>${p.role === 'resource' ? `<button class="btn-secondary" type="button" data-reset-pin="${p.id}">Reset PIN</button>` : '—'}</td></tr>`
    )
    .join('')}</tbody></table></div>
    <div class="panel"><p class="muted" style="margin:0">Partners sign in with email + personal PIN (not the shared owner password). Reset PIN shows a one-time PIN and temporary password to share privately.</p></div>`;
}

function renderClients() {
  document.getElementById('eyebrow').textContent = 'Accounts';
  document.getElementById('title').textContent = 'Clients';
  document.getElementById('topCta').innerHTML = `<button class="btn-primary" type="button" id="addClient">+ Client</button>`;
  if (!state.clients.length) return `<div class="panel empty"><h3>No clients yet</h3><p>Add one with GSTIN, contact and site address for quotations.</p></div>`;
  return `<div class="service-grid">${state.clients
    .map(
      (c) =>
        `<article class="service-card">
          <h3>${esc(c.name)}</h3>
          <p>⌖ ${esc(c.address || c.location || '—')}</p>
          <p class="muted">${esc(c.contactPerson || '—')} · ${esc(c.phone || '—')}</p>
          <p class="muted">GSTIN ${esc(c.gstin || '—')}</p>
          <footer>
            <span>${c.sitesCount || c.sites?.length || 0} sites · ${c.openTickets || 0} open · ${c.quoteCount || 0} quotes</span>
            ${badge(c.amcStatus)}
          </footer>
        </article>`
    )
    .join('')}</div>`;
}

function lineAmount(l) {
  return Math.round(Number(l.qty) * Number(l.rate) * 100) / 100;
}

function lineTax(l) {
  const amt = lineAmount(l);
  const gst = Number(l.gstPct || 18);
  if (state.quoteMeta.gstMode === 'inclusive') return Math.round(((amt * gst) / (100 + gst)) * 100) / 100;
  return Math.round(((amt * gst) / 100) * 100) / 100;
}

function quoteMath() {
  const taxable = state.quoteLines.reduce((s, l) => s + lineAmount(l), 0);
  const discountPct = Number(state.quoteMeta.discountPct) || 0;
  const discountAmount = Math.round(((taxable * discountPct) / 100) * 100) / 100;
  const after = Math.max(0, taxable - discountAmount);
  const taxAmount =
    state.quoteMeta.gstMode === 'inclusive'
      ? state.quoteLines.reduce((s, l) => s + lineTax(l), 0)
      : state.quoteLines.reduce((s, l) => {
          const share = taxable ? lineAmount(l) / taxable : 0;
          const lineAfter = lineAmount(l) - discountAmount * share;
          return s + (lineAfter * Number(l.gstPct || 18)) / 100;
        }, 0);
  const grand =
    state.quoteMeta.gstMode === 'inclusive' ? after : Math.round((after + taxAmount) * 100) / 100;
  const advance = Math.round(grand * (Number(state.quoteMeta.firstPaymentPct) || 0) * 0.01 * 100) / 100;
  return {
    taxable: Math.round(taxable * 100) / 100,
    discountAmount,
    taxAmount: Math.round(taxAmount * 100) / 100,
    cgst: Math.round((taxAmount / 2) * 100) / 100,
    sgst: Math.round((taxAmount / 2) * 100) / 100,
    grand,
    advance,
    balance: Math.round((grand - advance) * 100) / 100
  };
}

function filteredMaterials() {
  const q = state.materialQuery.trim().toLowerCase();
  return state.materials.filter((m) => {
    if (state.materialCategory !== 'all' && m.category !== state.materialCategory) return false;
    if (state.materialColor !== 'all' && m.colorName !== state.materialColor) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      (m.colorName || '').toLowerCase().includes(q) ||
      (m.barcode || '').toLowerCase().includes(q)
    );
  });
}

function colorSwatch(m) {
  if (!m.colorHex && !m.colorName) return '';
  const hex = m.colorHex || '#94a3b8';
  const striped = /green\/yellow|gy/i.test(m.colorName || '');
  const style = striped
    ? `background: repeating-linear-gradient(135deg,#22c55e 0 6px,#eab308 6px 12px);`
    : `background:${hex};`;
  return `<span class="color-dot" title="${esc(m.colorName || '')}" style="${style}"></span>`;
}

function barcodeHtml(code, compact = false) {
  if (!code || !window.DKBarcode) return `<code class="muted">${esc(code || '')}</code>`;
  return `<div class="barcode-wrap ${compact ? 'compact' : ''}">${DKBarcode.svgBarcode(code, compact ? 28 : 40, compact ? 1.2 : 1.5)}</div>`;
}

function applyClientToMeta(clientId) {
  const c = state.clients.find((x) => String(x.id) === String(clientId));
  state.quoteMeta.clientId = clientId;
  if (!c) return;
  state.quoteMeta.contactName = c.contactPerson || state.quoteMeta.contactName;
  state.quoteMeta.contactPhone = c.phone || state.quoteMeta.contactPhone;
  state.quoteMeta.contactEmail = c.email || state.quoteMeta.contactEmail;
  state.quoteMeta.siteAddress = c.address || c.location || state.quoteMeta.siteAddress;
  state.quoteMeta.clientGstin = c.gstin || state.quoteMeta.clientGstin;
  state.quoteMeta.placeOfSupply = c.location || state.quoteMeta.placeOfSupply;
}

function renderQuotations() {
  document.getElementById('eyebrow').textContent = 'Commercial';
  if (state.view === 'quote-new') {
    document.getElementById('title').textContent = 'Detailed quotation';
    document.getElementById('topCta').innerHTML = `
      <button class="btn-secondary" type="button" id="cancelQuote">Back</button>
      <button class="btn-secondary" type="button" id="saveQuoteDraft">Save draft</button>
      <button class="btn-primary" type="button" id="saveQuote">Save & send</button>`;
    return renderQuoteBuilder();
  }
  if (state.view === 'quote-detail') {
    document.getElementById('title').textContent = 'Quotation detail';
    const isCustomer = API.user.role === 'customer';
    document.getElementById('topCta').innerHTML = `
      <button class="btn-secondary" type="button" id="cancelQuote">Back</button>
      <button class="btn-secondary" type="button" id="printQuote">Print</button>
      ${!isCustomer ? `<button class="btn-secondary" type="button" id="payQuote">Record payment</button>` : `<button class="btn-primary" type="button" id="payQuote">Pay advance</button>`}
      <button class="btn-secondary" type="button" id="razorPay">Razorpay / UPI</button>
      ${!isCustomer ? `<button class="btn-secondary" type="button" id="printGstQuote">PDF / WhatsApp</button>` : ''}
      ${!isCustomer ? `<button class="btn-secondary" type="button" id="makeInvoice">Make invoice</button>` : ''}
      ${!isCustomer ? `<button class="btn-primary" type="button" id="convertQuote">Convert to job</button>` : ''}`;
    return renderQuoteDetail();
  }
  document.getElementById('title').textContent = 'Quotations';
  document.getElementById('topCta').innerHTML = `<button class="btn-primary" type="button" id="newQuote">+ Detailed quotation</button>`;
  const mats = state.materials.length;
  return `
    <div class="metrics">
      <article class="metric"><span>Quotations</span><strong>${state.quotations.length}</strong></article>
      <article class="metric"><span>Materials</span><strong>${mats}</strong></article>
      <article class="metric"><span>Sent</span><strong>${state.quotations.filter((q) => q.status === 'Sent').length}</strong></article>
      <article class="metric"><span>Approved</span><strong>${state.quotations.filter((q) => q.status === 'Approved').length}</strong></article>
    </div>
    <div class="panel">
      <div class="panel-h"><div><h2>Commercial quotations</h2><p>Full BOQ with GST, payment terms, validity and exclusions</p></div></div>
      ${
        state.quotations.length
          ? `<div class="table-wrap"><table><thead><tr><th>Quote</th><th>Client / scope</th><th>Validity</th><th>Lines</th><th>Total</th><th>Status</th></tr></thead><tbody>
          ${state.quotations
            .map(
              (q) => `<tr class="quote-row" data-open-quote="${q.id}">
              <td><strong>${esc(q.code)}</strong><div class="muted">Rev ${q.revision || 1}</div></td>
              <td><strong>${esc(q.clientName || q.client)}</strong><div class="muted">${esc(q.title || q.scope)}</div></td>
              <td>${esc(q.validUntil || '—')}</td>
              <td>${q.itemCount || 0}</td>
              <td><strong>${money(q.amount)}</strong></td>
              <td>${badge(q.status)}</td>
            </tr>`
            )
            .join('')}
          </tbody></table></div>`
          : '<div class="empty"><h3>No quotations yet</h3><p>Create a detailed material + labour quotation with GST and commercial terms.</p></div>'
      }
    </div>
    <div class="panel">
      <div class="panel-h"><div><h2>Materials rate card</h2><p>${mats} SKUs · colour-coded cables · barcodes on every item</p></div></div>
      <div class="chips">
        <button type="button" class="chip ${state.materialCategory === 'all' ? 'active' : ''}" data-mat-cat="all">All</button>
        ${state.materialCategories
          .map(
            (c) =>
              `<button type="button" class="chip ${state.materialCategory === c.name ? 'active' : ''}" data-mat-cat="${esc(c.name)}">${esc(c.name)} <em>${c.count}</em></button>`
          )
          .join('')}
      </div>
      <div class="chips color-chips">
        <button type="button" class="chip ${state.materialColor === 'all' ? 'active' : ''}" data-mat-color="all">All colours</button>
        ${state.materialColors
          .map(
            (c) =>
              `<button type="button" class="chip ${state.materialColor === c.name ? 'active' : ''}" data-mat-color="${esc(c.name)}">${colorSwatch({ colorName: c.name, colorHex: c.hex })} ${esc(c.name)} <em>${c.count}</em></button>`
          )
          .join('')}
      </div>
      <div class="mat-preview">${filteredMaterials()
        .slice(0, 36)
        .map(
          (m) =>
            `<div class="mat-pill">
              <div class="mat-pill-top">${colorSwatch(m)}<span>${esc(m.name)}<small class="muted"> ${esc(m.sku)}${m.colorName ? ' · ' + esc(m.colorName) : ''}</small></span><strong>${money(m.rate)}/${esc(m.unit)}</strong></div>
              ${barcodeHtml(m.barcode, true)}
            </div>`
        )
        .join('')}</div>
    </div>`;
}

function renderQuoteBuilder() {
  const m = state.quoteMeta;
  const lines = state.quoteLines;
  const mats = filteredMaterials();
  const calc = quoteMath();
  return `
    <div class="quote-layout detailed">
      <section class="panel quote-catalog">
        <div class="panel-h"><div><h2>Materials catalog</h2><p>Tap to add wires, pipes, fittings, fire & labour</p></div></div>
        <input class="search" id="matSearch" type="search" placeholder="Search SKU / wire / pipe / MCB / hydrant…" value="${esc(state.materialQuery)}" />
        <div class="chips">
          <button type="button" class="chip ${state.materialCategory === 'all' ? 'active' : ''}" data-mat-cat="all">All</button>
          ${state.materialCategories
            .map(
              (c) =>
                `<button type="button" class="chip ${state.materialCategory === c.name ? 'active' : ''}" data-mat-cat="${esc(c.name)}">${esc(c.name)}</button>`
            )
            .join('')}
        </div>
        <div class="chips color-chips">
          <button type="button" class="chip ${state.materialColor === 'all' ? 'active' : ''}" data-mat-color="all">All colours</button>
          ${state.materialColors
            .slice(0, 12)
            .map(
              (c) =>
                `<button type="button" class="chip ${state.materialColor === c.name ? 'active' : ''}" data-mat-color="${esc(c.name)}">${colorSwatch({ colorName: c.name, colorHex: c.hex })} ${esc(c.name)}</button>`
            )
            .join('')}
        </div>
        <div class="mat-list">${mats
          .slice(0, 120)
          .map(
            (item) => `<button type="button" class="mat-item" data-add-mat="${item.id}">
              <div class="mat-item-main">${colorSwatch(item)}<div><strong>${esc(item.name)}</strong><small>${esc(item.sku)}${item.colorName ? ' · ' + esc(item.colorName) : ''} · ${esc(item.barcode || '')}</small></div></div>
              <span>${money(item.rate)}<small>/${esc(item.unit)}</small></span>
            </button>`
          )
          .join('')}</div>
      </section>
      <section class="panel quote-cart">
        <div class="panel-h"><div><h2>Quote header</h2><p>Client, site, validity and commercial terms</p></div></div>
        <div class="form-grid">
          <label>Client
            <select id="qm-clientId">
              <option value="">Select client</option>
              ${state.clients
                .map(
                  (c) =>
                    `<option value="${c.id}" ${String(m.clientId) === String(c.id) ? 'selected' : ''}>${esc(c.name)}${c.location ? ' · ' + esc(c.location) : ''}</option>`
                )
                .join('')}
            </select>
          </label>
          <label>Title / project<input id="qm-title" value="${esc(m.title)}" placeholder="e.g. Hydrant + electrical materials – Warehouse A" /></label>
          <label>Contact person<input id="qm-contactName" value="${esc(m.contactName)}" /></label>
          <label>Phone<input id="qm-contactPhone" value="${esc(m.contactPhone)}" /></label>
          <label>Email<input id="qm-contactEmail" value="${esc(m.contactEmail)}" /></label>
          <label>Client GSTIN<input id="qm-clientGstin" value="${esc(m.clientGstin)}" placeholder="22AAAAA0000A1Z5" /></label>
          <label class="full">Site / delivery address<textarea id="qm-siteAddress" rows="2">${esc(m.siteAddress)}</textarea></label>
          <label>Quote date<input id="qm-quoteDate" type="date" value="${esc(m.quoteDate)}" /></label>
          <label>Valid until<input id="qm-validUntil" type="date" value="${esc(m.validUntil)}" /></label>
          <label>Place of supply<input id="qm-placeOfSupply" value="${esc(m.placeOfSupply)}" /></label>
          <label>GST mode
            <select id="qm-gstMode">
              <option value="exclusive" ${m.gstMode === 'exclusive' ? 'selected' : ''}>GST extra (exclusive)</option>
              <option value="inclusive" ${m.gstMode === 'inclusive' ? 'selected' : ''}>GST inclusive</option>
            </select>
          </label>
          <label>Discount %<input id="qm-discountPct" type="number" min="0" max="100" step="0.1" value="${m.discountPct}" /></label>
          <label>Advance %<input id="qm-firstPaymentPct" type="number" min="0" max="100" step="1" value="${m.firstPaymentPct}" /></label>
          <label class="full">Payment terms<textarea id="qm-paymentTerms" rows="2">${esc(m.paymentTerms)}</textarea></label>
          <label class="full">Delivery / schedule<textarea id="qm-deliveryTerms" rows="2">${esc(m.deliveryTerms)}</textarea></label>
          <label class="full">Warranty<textarea id="qm-warrantyTerms" rows="2">${esc(m.warrantyTerms)}</textarea></label>
          <label class="full">Notes<textarea id="qm-notes" rows="2">${esc(m.notes)}</textarea></label>
          <label class="full">Exclusions<textarea id="qm-exclusions" rows="2">${esc(m.exclusions)}</textarea></label>
        </div>

        <div class="panel-h" style="margin-top:18px"><div><h2>Bill of quantities</h2><p>${lines.length} lines · edit qty, rate, GST</p></div></div>
        ${
          lines.length
            ? `<div class="table-wrap"><table class="boq"><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST%</th><th>Amount</th><th></th></tr></thead><tbody>
            ${lines
              .map(
                (l, i) => `<tr>
                <td>${i + 1}</td>
                <td>${colorSwatch(l)}<strong>${esc(l.description)}</strong><div class="muted">${esc(l.sku || '')}${l.barcode ? ' · ' + esc(l.barcode) : ''}${l.colorName ? ' · ' + esc(l.colorName) : ''}</div></td>
                <td><input class="tiny" data-line-hsn="${i}" value="${esc(l.hsn || '')}" /></td>
                <td><input class="qty" data-line-qty="${i}" type="number" min="0.01" step="0.01" value="${l.qty}" /></td>
                <td>${esc(l.unit)}</td>
                <td><input class="qty" data-line-rate="${i}" type="number" min="0" step="0.01" value="${l.rate}" /></td>
                <td><input class="tiny" data-line-gst="${i}" type="number" min="0" step="1" value="${l.gstPct || 18}" /></td>
                <td><strong>${money(lineAmount(l))}</strong></td>
                <td><button type="button" class="icon-btn" data-line-del="${i}">×</button></td>
              </tr>`
              )
              .join('')}
            </tbody></table></div>
            <div class="totals-box">
              <div><span>Taxable value</span><strong>${money(calc.taxable)}</strong></div>
              <div><span>Discount (${m.discountPct || 0}%)</span><strong>− ${money(calc.discountAmount)}</strong></div>
              <div><span>CGST</span><strong>${money(calc.cgst)}</strong></div>
              <div><span>SGST</span><strong>${money(calc.sgst)}</strong></div>
              <div class="grand"><span>Grand total</span><strong>${money(calc.grand)}</strong></div>
              <div><span>Advance (${m.firstPaymentPct || 0}%)</span><strong>${money(calc.advance)}</strong></div>
              <div><span>Balance</span><strong>${money(calc.balance)}</strong></div>
            </div>`
            : '<div class="empty"><h3>No BOQ lines yet</h3><p>Add materials from the catalog. Each line stores SKU, HSN, qty, rate and GST.</p></div>'
        }
      </section>
    </div>`;
}

function renderQuoteDetail() {
  const q = state.quoteDetail || state.quotations.find((x) => x.id === state.quoteViewId);
  if (!q) return `<div class="panel empty"><h3>Quotation not found</h3></div>`;
  const items = q.items || [];
  const t = q.totals || {};
  return `
    <div class="quote-doc" id="quotePrint">
      <header class="quote-doc-head">
        <div>
          <p class="eyebrow">DeepKamal · Material & works quotation</p>
          <h2>${esc(q.title || q.scope)}</h2>
          <p class="muted">${esc(q.code)} · Revision ${q.revision || 1} · ${badge(q.status)}</p>
        </div>
        <div class="quote-doc-meta">
          <div><span>Date</span><strong>${esc(q.quoteDate || '—')}</strong></div>
          <div><span>Valid until</span><strong>${esc(q.validUntil || '—')}</strong></div>
          <div><span>Prepared by</span><strong>${esc(q.preparedBy || '—')}</strong></div>
        </div>
      </header>
      <div class="quote-parties">
        <div>
          <h3>Bill to</h3>
          <strong>${esc(q.clientName || q.client)}</strong>
          <p>${esc(q.siteAddress || q.clientAddress || q.clientLocation || '—')}</p>
          <p>Contact: ${esc(q.contactName || '—')} · ${esc(q.contactPhone || '—')}</p>
          <p>${esc(q.contactEmail || '')}</p>
          <p>GSTIN: ${esc(q.clientGstin || '—')}</p>
        </div>
        <div>
          <h3>From</h3>
          <strong>DeepKamal</strong>
          <p>Electrical · Fire safety · AMC</p>
          <p>Place of supply: ${esc(q.placeOfSupply || '—')}</p>
          <p>GSTIN: ${esc(q.companyGstin || '—')}</p>
          <p>GST mode: ${esc(q.gstMode || 'exclusive')}</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="boq">
          <thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST%</th><th>Tax</th><th>Amount</th></tr></thead>
          <tbody>
            ${items
              .map(
                (i, n) => `<tr>
                <td>${n + 1}</td>
                <td><strong>${esc(i.description)}</strong><div class="muted">${esc(i.sku || '')}${i.specs ? ' · ' + esc(i.specs) : ''}</div></td>
                <td>${esc(i.hsn || '—')}</td>
                <td>${i.qty}</td>
                <td>${esc(i.unit)}</td>
                <td>${money(i.rate)}</td>
                <td>${i.gstPct || 18}%</td>
                <td>${money(i.taxAmount)}</td>
                <td>${money(i.amount)}</td>
              </tr>`
              )
              .join('') || '<tr><td colspan="9">No lines</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="quote-bottom">
        <div class="terms-grid">
          <div><h3>Payment terms</h3><p>${esc(q.paymentTerms || '—')}</p></div>
          <div><h3>Delivery</h3><p>${esc(q.deliveryTerms || '—')}</p></div>
          <div><h3>Warranty</h3><p>${esc(q.warrantyTerms || '—')}</p></div>
          <div><h3>Exclusions</h3><p>${esc(q.exclusions || '—')}</p></div>
          <div class="full"><h3>Notes</h3><p>${esc(q.notes || '—')}</p></div>
        </div>
        <div class="totals-box solid">
          <div><span>Taxable</span><strong>${money(t.taxable != null ? t.taxable : q.subtotal)}</strong></div>
          <div><span>Discount</span><strong>− ${money(q.discountAmount || 0)}</strong></div>
          <div><span>CGST</span><strong>${money(t.cgst != null ? t.cgst : (q.taxAmount || 0) / 2)}</strong></div>
          <div><span>SGST</span><strong>${money(t.sgst != null ? t.sgst : (q.taxAmount || 0) / 2)}</strong></div>
          <div class="grand"><span>Grand total</span><strong>${money(q.amount)}</strong></div>
          <div><span>Suggested advance</span><strong>${money(q.firstPayment)}</strong></div>
          <div><span>Amount paid</span><strong>${money(q.amountPaid || 0)}</strong></div>
          <div><span>Balance</span><strong>${money(q.balance)}</strong></div>
          ${q.ticketId ? `<div><span>Linked job</span><strong>#${q.ticketId}</strong></div>` : ''}
        </div>
      </div>
    </div>
    <div class="job-actions" style="margin-top:14px">
      ${q.status !== 'Approved' ? `<button class="btn-primary" type="button" data-quote-status="Approved">Approve${API.user.role === 'customer' ? '' : ' + create job'}</button>` : ''}
      ${q.status !== 'Rejected' ? `<button class="btn-secondary" type="button" data-quote-status="Rejected">Reject</button>` : ''}
      ${q.status === 'Draft' ? `<button class="btn-secondary" type="button" data-quote-status="Sent">Mark sent</button>` : ''}
    </div>`;
}

function renderAttendance() {
  document.getElementById('eyebrow').textContent = 'Payroll';
  document.getElementById('title').textContent = 'Attendance';
  const isOps = API.user.role === 'admin' || API.user.role === 'manager';
  document.getElementById('topCta').innerHTML = isOps
    ? `<button class="btn-secondary" type="button" id="markAllHalf">Mark all half-day</button>
       <button class="btn-primary" type="button" id="markAllPresent">Mark all present</button>`
    : `<button class="btn-primary" type="button" id="markSelfPresent">Mark me present</button>`;

  if (API.user.role === 'resource') {
    const mine = state.attendance?.find((a) => Number(a.id) === Number(API.user.id));
    return `
      <div class="panel">
        <div class="panel-h"><div><h2>Mark your attendance</h2><p>Today · saved to payroll</p></div>${badge(mine?.today || 'Not marked')}</div>
        <p class="muted" style="margin:0 0 10px">Present / Half day requires GPS check-in on this device.</p>
        <div class="partner-att-actions job-actions">
          <button class="btn-primary" type="button" data-att-self="Present">Present today</button>
          <button class="btn-secondary" type="button" data-att-self="Half day">Half day</button>
          <button class="btn-secondary" type="button" data-att-self="Absent">Absent</button>
        </div>
        ${
          mine?.geo
            ? `<p class="muted" style="margin:12px 0 0">GPS ${Number(mine.geo.latitude).toFixed(5)}, ${Number(mine.geo.longitude).toFixed(5)} · ${esc(mine.geo.checkInAt || '')}</p>`
            : ''
        }
      </div>
      <div class="metrics">
        <article class="metric"><span>Today</span><strong>${esc(mine?.today || 'Not marked')}</strong></article>
        <article class="metric"><span>Days this month</span><strong>${mine?.days ?? 0}</strong></article>
        <article class="metric"><span>Wage balance</span><strong>${money(mine?.wageBalance || 0)}</strong></article>
        <article class="metric"><span>Payable</span><strong>${money(mine?.payable || 0)}</strong></article>
      </div>`;
  }

  if (!state.attendance.length) {
    return `<div class="panel empty"><h3>No field team found</h3><p>Add partners in Team, then mark attendance here.</p></div>`;
  }

  const presentToday = state.attendance.filter((a) => a.today === 'Present' || a.today === 'Half day').length;
  return `
    <div class="metrics">
      <article class="metric"><span>Present today</span><strong>${presentToday}/${state.attendance.length}</strong></article>
      <article class="metric"><span>Payroll total</span><strong>${money(state.payrollTotal || 0)}</strong></article>
    </div>
    <div class="panel table-wrap">
      <div class="panel-h"><div><h2>Field team — today</h2><p>Mark each person, or use Mark all present</p></div></div>
      <table>
        <thead><tr><th>Name</th><th>Rate</th><th>Days</th><th>Payable</th><th>Today</th><th>Mark</th></tr></thead>
        <tbody>${state.attendance
          .map(
            (a) => `<tr>
              <td><strong>${esc(a.name)}</strong><div class="muted">${esc(a.role || '')}</div></td>
              <td>${money(a.rate)}</td>
              <td>${a.days}</td>
              <td>${money(a.payable)}</td>
              <td>${badge(a.today)}</td>
              <td>
                <div class="att-actions">
                  <button type="button" class="att-btn ${a.today === 'Present' ? 'on' : ''}" data-att="${a.id}" data-status="Present">P</button>
                  <button type="button" class="att-btn ${a.today === 'Half day' ? 'on' : ''}" data-att="${a.id}" data-status="Half day">H</button>
                  <button type="button" class="att-btn ${a.today === 'Absent' ? 'on' : ''}" data-att="${a.id}" data-status="Absent">A</button>
                </div>
              </td>
            </tr>`
          )
          .join('')}
        </tbody>
      </table>
    </div>`;
}

function renderApprovals() {
  document.getElementById('eyebrow').textContent = 'Controls';
  document.getElementById('title').textContent = 'Approvals';
  document.getElementById('topCta').innerHTML = '';
  const approved = state.approvedClaims || [];
  if (!state.approvals.length && !approved.length) return `<div class="panel empty"><h3>Nothing pending</h3></div>`;
  return `
    <div class="panel"><div class="panel-h"><div><h2>Inbox</h2><p>Claims, AMC alerts, evidence</p></div></div>
    <div class="list">${state.approvals
      .map((a) => {
        let actions = badge(a.type);
        if (a.type === 'claim') {
          actions = `<span class="job-actions">
            <button class="btn-primary" data-approve="${a.id}">Approve</button>
            <button class="btn-secondary" data-reject="${a.id}">Reject</button>
          </span>`;
        }
        return `<div class="row"><div><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></div>${actions}</div>`;
      })
      .join('') || '<div class="empty"><h3>Inbox clear</h3></div>'}</div></div>
    ${
      approved.length
        ? `<div class="panel"><div class="panel-h"><div><h2>Approved — ready to pay</h2></div></div>
        <div class="list">${approved
          .map(
            (a) =>
              `<div class="row"><div><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></div>
              <button class="btn-primary" data-pay-claim="${a.id}">Mark paid</button></div>`
          )
          .join('')}</div></div>`
        : ''
    }`;
}

function renderAccount() {
  document.getElementById('eyebrow').textContent = 'Profile';
  document.getElementById('title').textContent = 'Account';
  document.getElementById('topCta').innerHTML = '';
  const offlinePending = window.DKOffline ? DKOffline.pending() : 0;
  const isPartner = API.user.role === 'resource';
  return `<div class="panel"><div class="list">
    <div class="row"><div><strong>${esc(API.user.name)}</strong><small>${esc(API.user.email)}</small></div>${badge(API.user.role)}</div>
    ${API.user.mustChangePassword ? `<div class="row"><div><strong>Password change required</strong><small>Set your own password before continuing field work</small></div>${badge('Action')}</div>` : ''}
    <div class="row"><div><strong>Change password</strong><small>Personal login — not the shared demo password</small></div>
      <button class="btn-secondary" type="button" id="changePassBtn">Update</button></div>
    ${
      isPartner
        ? `<div class="row"><div><strong>Partner PIN</strong><small>4–6 digits for fast field login</small></div>
      <button class="btn-primary" type="button" id="setPinBtn">Set PIN</button></div>`
        : ''
    }
    <div class="row"><div><strong>Offline queue</strong><small>${offlinePending} action(s) waiting to sync</small></div>
      <button class="btn-secondary" type="button" id="flushOffline">Sync now</button></div>
    <div class="row logout-row"><div><strong>Sign out</strong><small>Clear this device session</small></div>
      <button class="btn-logout-lg" type="button" id="logout2">Log out</button></div>
  </div></div>`;
}

function renderDatabase() {
  document.getElementById('eyebrow').textContent = 'System';
  document.getElementById('title').textContent = 'Database';
  document.getElementById('topCta').innerHTML = `
    <button class="btn-secondary" type="button" id="dbBackup">Backup now</button>
    <button class="btn-primary" type="button" id="dbPing">Test write</button>`;
  const d = state.dbInfo;
  if (!d) {
    return `<div class="panel empty"><h3>Loading database status…</h3><p>If this stays empty, you are not on the Node server. Use http://localhost:3000 after npm start.</p></div>`;
  }
  const c = d.counts || {};
  const sb = d.supabase || {};
  const rz = state.razorpay || {};
  return `
    <div class="panel ${d.ok ? '' : 'bad-panel'}">
      <div class="panel-h"><div><h2>${d.ok ? 'SQLite connected' : 'Database error'}</h2><p>${esc(d.path || '')}</p></div>${badge(d.ok ? 'Online' : 'Offline')}</div>
      <div class="list">
        <div class="row"><div><strong>Engine</strong><small>${esc(d.engine)} via ${esc(d.driver)}</small></div><span>${esc(d.journalMode || '')}</span></div>
        <div class="row"><div><strong>File size</strong><small>data/deepkamal.db · backups in data/backups</small></div><strong>${Math.round((d.sizeBytes || 0) / 1024)} KB</strong></div>
        <div class="row"><div><strong>Supabase</strong><small>${esc(sb.note || 'Optional hosted DB')}</small></div>${badge(sb.enabled ? 'Configured' : 'SQLite only')}</div>
        <div class="row"><div><strong>Razorpay</strong><small>${esc(rz.note || 'Demo checkout without keys')}</small></div>${badge(rz.mode || 'demo')}</div>
        <div class="row"><div><strong>Nightly backup</strong><small>npm run backup:nightly · keep 30 copies in data/backups</small></div>
          <button class="btn-secondary" type="button" id="dbExportSb">Export for Supabase</button></div>
      </div>
    </div>
    <div class="metrics">
      <article class="metric"><span>Users</span><strong>${c.users || 0}</strong></article>
      <article class="metric"><span>Services</span><strong>${c.services || 0}</strong></article>
      <article class="metric"><span>Tickets</span><strong>${c.tickets || 0}</strong></article>
      <article class="metric"><span>Orders</span><strong>${c.orders || 0}</strong></article>
      <article class="metric"><span>Clients</span><strong>${c.clients || 0}</strong></article>
      <article class="metric"><span>Team</span><strong>${c.people || 0}</strong></article>
      <article class="metric"><span>Materials</span><strong>${c.materials || 0}</strong></article>
      <article class="metric"><span>Quotations</span><strong>${c.quotations || 0}</strong></article>
      <article class="metric"><span>Invoices</span><strong>${(state.invoices || []).length}</strong></article>
      <article class="metric"><span>Assets</span><strong>${(state.assets || []).length}</strong></article>
    </div>
    <div class="panel"><p style="color:var(--muted);margin:0;line-height:1.5">Primary store is SQLite on this machine. Use <strong>Backup now</strong> (or <code>npm run backup</code>) before multi-device / hosted moves. Set <code>SUPABASE_URL</code> + keys in <code>.env</code> when you are ready for a hosted DB.</p></div>
  `;
}

function bindScreen() {
  document.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.onclick = () => {
      state.categoryId = btn.dataset.cat;
      if (state.view === 'home' && API.user.role === 'customer') {
        // filter on home via services view semantics
        state.view = 'services';
      }
      render();
    };
  });
  document.querySelectorAll('[data-sid]').forEach((card) => {
    const svc = state.services.find((s) => String(s.id) === card.dataset.sid);
    if (!svc) return;
    card.querySelector('button')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (API.user.role === 'customer') bookService(svc);
    });
    card.onclick = () => {
      if (API.user.role === 'customer') bookService(svc);
    };
  });
  document.getElementById('newTicket')?.addEventListener('click', createTicket);
  document.getElementById('goDispatch')?.addEventListener('click', () => {
    state.view = 'dispatch';
    render();
  });
  document.getElementById('addClient')?.addEventListener('click', addClient);
  document.getElementById('addSvc')?.addEventListener('click', addService);
  document.getElementById('markAllPresent')?.addEventListener('click', () => markAttendanceAll('Present'));
  document.getElementById('markAllHalf')?.addEventListener('click', () => markAttendanceAll('Half day'));
  document.getElementById('markSelfPresent')?.addEventListener('click', () => markOneAttendance(API.user.id, 'Present'));
  document.querySelectorAll('[data-att-self]').forEach((btn) => {
    btn.onclick = () => markOneAttendance(API.user.id, btn.dataset.attSelf);
  });
  document.querySelectorAll('[data-att]').forEach((btn) => {
    btn.onclick = () => markOneAttendance(Number(btn.dataset.att), btn.dataset.status);
  });
  document.getElementById('newQuote')?.addEventListener('click', () => {
    state.quoteLines = [];
    state.quoteMeta = defaultQuoteMeta();
    if (state.clients[0]) applyClientToMeta(state.clients[0].id);
    state.materialCategory = 'all';
    state.materialQuery = '';
    state.view = 'quote-new';
    render();
  });
  document.getElementById('cancelQuote')?.addEventListener('click', () => {
    state.view = 'quotations';
    state.quoteViewId = null;
    state.quoteDetail = null;
    render();
  });
  document.getElementById('saveQuote')?.addEventListener('click', () => saveQuotation('Sent'));
  document.getElementById('saveQuoteDraft')?.addEventListener('click', () => saveQuotation('Draft'));
  document.getElementById('printQuote')?.addEventListener('click', () => window.print());
  bindQuoteMetaFields();
  document.getElementById('matSearch')?.addEventListener('input', (e) => {
    state.materialQuery = e.target.value;
    render();
    const input = document.getElementById('matSearch');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  document.querySelectorAll('[data-mat-cat]').forEach((btn) => {
    btn.onclick = () => {
      state.materialCategory = btn.dataset.matCat;
      render();
    };
  });
  document.querySelectorAll('[data-mat-color]').forEach((btn) => {
    btn.onclick = () => {
      state.materialColor = btn.dataset.matColor;
      render();
    };
  });
  document.querySelectorAll('[data-add-mat]').forEach((btn) => {
    btn.onclick = () => {
      const mat = state.materials.find((m) => String(m.id) === btn.dataset.addMat);
      if (!mat) return;
      const existing = state.quoteLines.find((l) => l.materialId === mat.id);
      if (existing) existing.qty = Number(existing.qty) + 1;
      else {
        state.quoteLines.push({
          materialId: mat.id,
          sku: mat.sku,
          category: mat.category,
          description: mat.name,
          specs: [mat.colorName, mat.barcode, mat.description].filter(Boolean).join(' · '),
          unit: mat.unit,
          qty: 1,
          rate: mat.rate,
          gstPct: mat.gstPct || 18,
          hsn: '',
          colorName: mat.colorName,
          barcode: mat.barcode
        });
      }
      toast(`Added ${mat.name}`);
      render();
    };
  });
  document.querySelectorAll('[data-line-qty]').forEach((input) => {
    input.onchange = () => {
      state.quoteLines[Number(input.dataset.lineQty)].qty = Number(input.value) || 1;
      render();
    };
  });
  document.querySelectorAll('[data-line-rate]').forEach((input) => {
    input.onchange = () => {
      state.quoteLines[Number(input.dataset.lineRate)].rate = Number(input.value) || 0;
      render();
    };
  });
  document.querySelectorAll('[data-line-gst]').forEach((input) => {
    input.onchange = () => {
      state.quoteLines[Number(input.dataset.lineGst)].gstPct = Number(input.value) || 18;
      render();
    };
  });
  document.querySelectorAll('[data-line-hsn]').forEach((input) => {
    input.onchange = () => {
      state.quoteLines[Number(input.dataset.lineHsn)].hsn = input.value;
    };
  });
  document.querySelectorAll('[data-line-del]').forEach((btn) => {
    btn.onclick = () => {
      state.quoteLines.splice(Number(btn.dataset.lineDel), 1);
      render();
    };
  });
  document.querySelectorAll('[data-open-quote]').forEach((row) => {
    row.onclick = async () => {
      try {
        const data = await API.get(`/quotations/${row.dataset.openQuote}`);
        state.quoteDetail = data.quotation;
        state.quoteViewId = data.quotation.id;
        const idx = state.quotations.findIndex((q) => q.id === data.quotation.id);
        if (idx >= 0) state.quotations[idx] = data.quotation;
        state.view = 'quote-detail';
        render();
      } catch (err) {
        toast(err.message);
      }
    };
  });
  document.querySelectorAll('[data-quote-status]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        const data = await API.patch(`/quotations/${state.quoteViewId}`, {
          status: btn.dataset.quoteStatus,
          convert: btn.dataset.quoteStatus === 'Approved'
        });
        state.quoteDetail = data.quotation;
        await loadAll();
        const extra = data.conversion?.ticketCode ? ` · job ${data.conversion.ticketCode}` : '';
        toast(`Status → ${btn.dataset.quoteStatus}${extra}`);
        render();
      } catch (err) {
        toast(err.message);
      }
    };
  });

  document.querySelectorAll('[data-assign]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.assign;
      const select = document.querySelector(`[data-partner-for="${id}"]`);
      const partnerId = Number(select?.value);
      if (!partnerId) return toast('Select a partner first');
      try {
        await API.post(`/tickets/${id}/assign`, { assignedUserId: partnerId });
        toast('Partner assigned');
        await loadAll();
        render();
      } catch (err) {
        toast(err.message);
      }
    };
  });

  document.querySelectorAll('[data-open-assign]').forEach((btn) => {
    btn.onclick = () => openAssignSheet(Number(btn.dataset.openAssign));
  });

  document.querySelectorAll('[data-job-status]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await API.post(`/tickets/${btn.dataset.jobStatus}/status`, { status: btn.dataset.next });
        toast(`Status → ${btn.dataset.next}`);
        await loadAll();
        render();
      } catch (err) {
        toast(err.message);
      }
    };
  });

  document.querySelectorAll('[data-job-complete]').forEach((btn) => {
    btn.onclick = () => completeJob(Number(btn.dataset.jobComplete));
  });
  document.getElementById('claimBtn')?.addEventListener('click', async () => {
    try {
      const data = await API.post('/attendance/claim');
      toast(`Claimed ${money(data.amount)}`);
      await loadAll();
      render();
    } catch (err) {
      toast(err.message);
    }
  });
  document.getElementById('logout2')?.addEventListener('click', logout);
  document.getElementById('flushOffline')?.addEventListener('click', async () => {
    if (!window.DKOffline) return toast('Offline helper not loaded');
    const r = await DKOffline.flush();
    toast(r.flushed ? `Synced ${r.flushed}` : 'Nothing to sync');
  });
  document.getElementById('changePassBtn')?.addEventListener('click', () => {
    openSheet(`
      <h2>Change password</h2>
      <form id="passForm">
        ${API.user.mustChangePassword ? '' : '<label>Current password<input name="currentPassword" type="password" required /></label>'}
        <label>New password<input name="newPassword" type="password" minlength="6" required /></label>
        <button class="btn-primary" type="submit" style="width:100%">Save password</button>
      </form>`);
    document.getElementById('passForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await API.post('/auth/change-password', {
        currentPassword: fd.get('currentPassword') || undefined,
        newPassword: fd.get('newPassword')
      });
      API.user.mustChangePassword = false;
      localStorage.setItem('deepkamal.user', JSON.stringify(API.user));
      closeSheet();
      toast('Password updated');
      render();
    };
  });
  document.getElementById('setPinBtn')?.addEventListener('click', () => {
    openSheet(`
      <h2>Set partner PIN</h2>
      <form id="pinForm">
        <label>New PIN (4–6 digits)<input name="pin" inputmode="numeric" pattern="\\d{4,6}" required /></label>
        <label>Confirm with password or current PIN<input name="confirm" required /></label>
        <button class="btn-primary" type="submit" style="width:100%">Save PIN</button>
      </form>`);
    document.getElementById('pinForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const confirm = String(fd.get('confirm') || '');
      const body = { pin: fd.get('pin') };
      if (/^\d{4,6}$/.test(confirm)) body.currentPin = confirm;
      else body.currentPassword = confirm;
      await API.post('/auth/set-pin', body);
      closeSheet();
      toast('PIN saved — use it at login');
    };
  });
  document.querySelectorAll('[data-reset-pin]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        const data = await API.post(`/auth/reset-partner/${btn.dataset.resetPin}`);
        openSheet(`
          <h2>Partner access reset</h2>
          <p><strong>${esc(data.partner.name)}</strong><br/>${esc(data.partner.email)}</p>
          <p>PIN: <code style="font-size:1.4rem">${esc(data.pin)}</code></p>
          <p>Temporary password: <code>${esc(data.temporaryPassword)}</code></p>
          <p class="meta">${esc(data.note)}</p>
          <button class="btn-primary" type="button" id="copyPinCreds" style="width:100%">Copy details</button>`);
        document.getElementById('copyPinCreds').onclick = async () => {
          await navigator.clipboard.writeText(
            `${data.partner.email}\nPIN: ${data.pin}\nTemp password: ${data.temporaryPassword}`
          );
          toast('Copied');
        };
      } catch (err) {
        toast(err.message);
      }
    };
  });
  document.querySelectorAll('[data-ticket-chat]').forEach((btn) => {
    btn.onclick = () => DKField.openTicketChat(Number(btn.dataset.ticketChat));
  });
  document.getElementById('printGstQuote')?.addEventListener('click', async () => {
    try {
      const q = state.quoteDetail;
      await DKField.sharePrint('quotation', q.id, q.contactPhone || q.contact_phone);
    } catch (err) {
      toast(err.message);
    }
  });
  document.getElementById('dbExportSb')?.addEventListener('click', () => {
    toast('Run on server: npm run db:export-supabase');
  });
  if (state.view === 'dispatch' && window.DKField && state.dispatch) {
    setTimeout(() => {
      DKField.renderDispatchMap(state.dispatch.mapJobs, state.dispatch.hq, state.dispatch.partners);
    }, 30);
  }
  document.getElementById('dbPing')?.addEventListener('click', async () => {
    try {
      const data = await API.post('/db/ping-write');
      state.dbInfo = data.status;
      toast('Write OK — ' + data.wrote.message);
      render();
    } catch (err) {
      toast(err.message);
    }
  });
  document.getElementById('dbBackup')?.addEventListener('click', async () => {
    try {
      const data = await API.post('/db/backup');
      toast(`Backup saved (${Math.round(data.sizeBytes / 1024)} KB)`);
      if (data.supabase) state.dbInfo = { ...state.dbInfo, supabase: data.supabase };
    } catch (err) {
      toast(err.message);
    }
  });
  document.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.onclick = async () => {
      await API.post(`/approvals/claims/${btn.dataset.approve}/decide`, { decision: 'approve' });
      toast('Approved');
      await loadAll();
      render();
    };
  });
  document.querySelectorAll('[data-reject]').forEach((btn) => {
    btn.onclick = async () => {
      await API.post(`/approvals/claims/${btn.dataset.reject}/decide`, { decision: 'reject' });
      toast('Rejected — balance restored');
      await loadAll();
      render();
    };
  });
  document.querySelectorAll('[data-pay-claim]').forEach((btn) => {
    btn.onclick = async () => {
      await API.post(`/approvals/claims/${btn.dataset.payClaim}/decide`, { decision: 'pay' });
      toast('Claim marked Paid');
      await loadAll();
      render();
    };
  });
  if (window.DKExtras) DKExtras.bind();
}

function bindQuoteMetaFields() {
  const map = [
    'clientId',
    'title',
    'contactName',
    'contactPhone',
    'contactEmail',
    'clientGstin',
    'siteAddress',
    'quoteDate',
    'validUntil',
    'placeOfSupply',
    'gstMode',
    'discountPct',
    'firstPaymentPct',
    'paymentTerms',
    'deliveryTerms',
    'warrantyTerms',
    'notes',
    'exclusions'
  ];
  map.forEach((key) => {
    const el = document.getElementById(`qm-${key}`);
    if (!el) return;
    const evt = el.tagName === 'SELECT' || el.type === 'date' || el.type === 'number' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      if (key === 'clientId') {
        applyClientToMeta(el.value);
        render();
        return;
      }
      state.quoteMeta[key] = el.type === 'number' ? Number(el.value) : el.value;
      if (key === 'discountPct' || key === 'firstPaymentPct' || key === 'gstMode') render();
    });
  });
}

function createTicket() {
  openSheet(`
    <h2>New ticket</h2>
    <form id="ticketForm">
      <label>Issue / fault<input name="title" required placeholder="e.g. Hydrant pressure drop at terrace" /></label>
      <label>Detailed description<textarea name="description" placeholder="Symptoms, location on site, safety risk, access notes"></textarea></label>
      <label>Client
        <select name="clientId">
          <option value="">Walk-in / none</option>
          ${state.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </label>
      <label>Priority
        <select name="priority"><option>Normal</option><option>High</option><option>Critical</option></select>
      </label>
      <button class="btn-primary" type="submit" style="width:100%">Save ticket</button>
    </form>
  `);
  document.getElementById('ticketForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await API.post('/tickets', {
      title: fd.get('title'),
      description: fd.get('description'),
      priority: fd.get('priority'),
      clientId: fd.get('clientId') ? Number(fd.get('clientId')) : null
    });
    closeSheet();
    toast('Ticket saved — assign from Dispatch');
    await loadAll();
    state.view = 'dispatch';
    render();
  };
}

function openAssignSheet(ticketId) {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  const partners = (state.dispatch?.partners || state.people.filter((p) => p.role === 'resource'));
  openSheet(`
    <h2>Assign partner</h2>
    <p class="meta">${esc(ticket?.code || '')} · ${esc(ticket?.title || '')}</p>
    <form id="assignForm">
      <label>Partner
        <select name="assignedUserId" required>
          <option value="">Select</option>
          ${partners.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
      </label>
      <button class="btn-primary" type="submit" style="width:100%">Assign job</button>
    </form>
  `);
  document.getElementById('assignForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await API.post(`/tickets/${ticketId}/assign`, { assignedUserId: Number(fd.get('assignedUserId')) });
    closeSheet();
    toast('Assigned');
    await loadAll();
    render();
  };
}

function completeJob(ticketId) {
  const ticket = state.tickets.find((t) => t.id === ticketId) || state.dashboard?.resource?.activeJobs?.find((j) => j.id === ticketId);
  openSheet(`
    <h2>Complete job</h2>
    <p class="meta">${esc(ticket?.code || '')} · ${esc(ticket?.title || '')}</p>
    <form id="completeForm">
      <label>Notes<textarea name="notes" placeholder="What was done on site"></textarea></label>
      <label>Site photo<input name="photo" type="file" accept="image/*" capture="environment" /></label>
      <p class="meta" id="geoStatus">Capturing GPS…</p>
      <button class="btn-primary" type="submit" style="width:100%">Submit completion</button>
    </form>
  `);
  const geo = { latitude: null, longitude: null };
  const geoEl = document.getElementById('geoStatus');
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geo.latitude = pos.coords.latitude;
        geo.longitude = pos.coords.longitude;
        geoEl.textContent = `GPS ${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}`;
      },
      () => {
        geoEl.textContent = 'GPS unavailable — completion will save without coordinates';
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    geoEl.textContent = 'This device has no geolocation';
  }

  document.getElementById('completeForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const photo = fd.get('photo');
    const payload = {
      ticketId,
      notes: fd.get('notes') || 'Job completed',
      complete: true,
      capturedAt: new Date().toISOString(),
      latitude: geo.latitude,
      longitude: geo.longitude
    };
    try {
      if (!navigator.onLine && window.DKOffline) {
        let photoData = null;
        if (photo && photo.size) {
          photoData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(photo);
          });
        }
        DKOffline.enqueue('evidence', { ...payload, photoData });
        closeSheet();
        toast('Saved offline — will sync when online');
        return;
      }
      if (photo && photo.size) {
        const form = new FormData();
        form.append('photo', photo);
        form.append('ticketId', String(ticketId));
        form.append('notes', payload.notes);
        form.append('complete', 'true');
        form.append('capturedAt', payload.capturedAt);
        if (geo.latitude != null) form.append('latitude', String(geo.latitude));
        if (geo.longitude != null) form.append('longitude', String(geo.longitude));
        await API.postForm('/uploads/evidence', form);
      } else {
        await API.post(`/tickets/${ticketId}/complete`, payload);
      }
      closeSheet();
      toast('Job completed and saved');
      await loadAll();
      render();
    } catch (err) {
      if (window.DKOffline) {
        DKOffline.enqueue('evidence', payload);
        closeSheet();
        toast('Network failed — queued offline');
      } else {
        toast(err.message);
      }
    }
  };
}

function addClient() {
  openSheet(`
    <h2>Add client</h2>
    <form id="clientForm">
      <label>Company / client name<input name="name" required /></label>
      <label>Contact person<input name="contactPerson" /></label>
      <label>Phone<input name="phone" placeholder="10-digit mobile" /></label>
      <label>Email<input name="email" type="email" /></label>
      <label>GSTIN<input name="gstin" placeholder="22AAAAA0000A1Z5" /></label>
      <label>City / place of supply<input name="location" required placeholder="City" /></label>
      <label>Full address<textarea name="address" placeholder="Site / billing address"></textarea></label>
      <label>Site name<input name="siteName" placeholder="Main site" /></label>
      <button class="btn-primary" type="submit" style="width:100%">Save client</button>
    </form>
  `);
  document.getElementById('clientForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await API.post('/clients', {
      name: fd.get('name'),
      location: fd.get('location'),
      address: fd.get('address'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      gstin: fd.get('gstin'),
      contactPerson: fd.get('contactPerson'),
      siteName: fd.get('siteName') || 'Main site',
      sitesCount: 1
    });
    closeSheet();
    toast('Client saved');
    await loadAll();
    render();
  };
}

function addService() {
  openSheet(`
    <h2>Add service</h2>
    <form id="svcForm">
      <label>Name<input name="name" required /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Price (INR)<input name="price" type="number" required /></label>
      <button class="btn-primary" type="submit" style="width:100%">Publish</button>
    </form>
  `);
  document.getElementById('svcForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await API.post('/services', {
      name: fd.get('name'),
      description: fd.get('description'),
      price: Number(fd.get('price'))
    });
    closeSheet();
    toast('Service published');
    await loadAll();
    render();
  };
}

async function markOneAttendance(userId, status) {
  try {
    const data = window.DKField
      ? await DKField.markAttendance(userId, status)
      : await API.post('/attendance', { userId: Number(userId) || API.user.id, status });
    if (API.user.role === 'resource' && data.wageBalance != null) {
      API.user.wageBalance = data.wageBalance;
    }
    const geoNote = data.geo ? ` · GPS ${Number(data.geo.latitude).toFixed(4)}, ${Number(data.geo.longitude).toFixed(4)}` : '';
    toast(`Attendance: ${status}${geoNote}`);
    await loadAll();
    render();
  } catch (err) {
    toast(err.message || 'Could not save attendance');
  }
}

async function markAttendanceAll(status = 'Present') {
  try {
    const data = await API.post('/attendance', { markAll: true, status });
    toast(`Marked ${data.marked} partners · ${status}`);
    await loadAll();
    render();
  } catch (err) {
    toast(err.message);
  }
}

async function saveQuotation(status = 'Sent') {
  const m = state.quoteMeta;
  if (!m.clientId) return toast('Select a client');
  if (!state.quoteLines.length) return toast('Add at least one material / labour line');
  const calc = quoteMath();
  try {
    const data = await API.post('/quotations', {
      clientId: Number(m.clientId),
      title: m.title || undefined,
      scope: m.title || undefined,
      contactName: m.contactName,
      contactPhone: m.contactPhone,
      contactEmail: m.contactEmail,
      siteAddress: m.siteAddress,
      clientGstin: m.clientGstin,
      placeOfSupply: m.placeOfSupply,
      quoteDate: m.quoteDate,
      validUntil: m.validUntil,
      paymentTerms: m.paymentTerms,
      deliveryTerms: m.deliveryTerms,
      warrantyTerms: m.warrantyTerms,
      notes: m.notes,
      exclusions: m.exclusions,
      discountPct: Number(m.discountPct) || 0,
      gstMode: m.gstMode,
      firstPayment: calc.advance,
      status,
      items: state.quoteLines.map((l) => ({
        materialId: l.materialId,
        sku: l.sku,
        category: l.category,
        description: l.description,
        specs: l.specs,
        unit: l.unit,
        qty: Number(l.qty),
        rate: Number(l.rate),
        gstPct: Number(l.gstPct) || 18,
        hsn: l.hsn
      }))
    });
    toast(`Saved ${data.quotation.code} · ${money(data.quotation.amount)}`);
    state.quoteLines = [];
    state.quoteMeta = defaultQuoteMeta();
    await loadAll();
    state.quoteDetail = data.quotation;
    state.quoteViewId = data.quotation.id;
    state.view = 'quote-detail';
    render();
  } catch (err) {
    toast(err.message);
  }
}

function render() {
  setChrome();
  const role = API.user.role;
  const root = document.getElementById('screen');
  if (state.view === 'account') root.innerHTML = renderAccount();
  else if (state.view === 'database') root.innerHTML = renderDatabase();
  else if (state.view === 'dispatch') root.innerHTML = renderDispatch();
  else if (state.view === 'services') root.innerHTML = renderServices();
  else if (state.view === 'orders') root.innerHTML = renderOrders();
  else if (state.view === 'tickets') root.innerHTML = renderTickets();
  else if (state.view === 'people') root.innerHTML = renderPeople();
  else if (state.view === 'clients') root.innerHTML = renderClients();
  else if (state.view === 'quotations' || state.view === 'quote-new' || state.view === 'quote-detail') {
    if (role === 'customer' && state.view === 'quotations') root.innerHTML = DKExtras.renderCustomerQuotes();
    else root.innerHTML = renderQuotations();
  } else if (state.view === 'inventory') root.innerHTML = DKExtras.renderInventory();
  else if (state.view === 'assets') root.innerHTML = DKExtras.renderAssets();
  else if (state.view === 'amc') root.innerHTML = DKExtras.renderAmc();
  else if (state.view === 'invoices') root.innerHTML = DKExtras.renderInvoices();
  else if (state.view === 'procurement') root.innerHTML = DKExtras.renderProcurement();
  else if (state.view === 'notifications') root.innerHTML = DKExtras.renderNotifications();
  else if (state.view === 'costing') root.innerHTML = DKExtras.renderCosting();
  else if (state.view === 'works') root.innerHTML = DKExtras.renderWorks();
  else if (state.view === 'banks') root.innerHTML = DKExtras.renderBanks();
  else if (state.view === 'feedback') root.innerHTML = DKExtras.renderFeedback();
  else if (state.view === 'attendance') root.innerHTML = renderAttendance();
  else if (state.view === 'approvals') root.innerHTML = renderApprovals();
  else if (role === 'customer') root.innerHTML = renderCustomerHome();
  else if (role === 'resource') root.innerHTML = renderPartnerHome();
  else root.innerHTML = renderOpsHome();
  bindScreen();
}

async function enterApp() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('app').hidden = false;
  state.view = 'home';
  try {
    await Promise.all([loadAll(), checkDb()]);
    if (window.DKOffline) {
      const r = await DKOffline.flush();
      if (r.flushed) toast(`Synced ${r.flushed} offline action(s)`);
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Loaded with some data errors');
  }
  render();
  if (API.user?.mustChangePassword) {
    setTimeout(() => {
      toast('Set your own password on Account');
      state.view = 'account';
      render();
    }, 400);
  }
}

async function boot() {
  checkDb();
  if (API.token && API.user) {
    try {
      const me = await API.get('/auth/me');
      API.setSession(API.token, me.user);
      await enterApp();
      return;
    } catch {
      API.clearSession();
    }
  }
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('app').hidden = true;
}

boot();
