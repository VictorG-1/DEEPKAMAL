const tickets = [
  { id: 'DK-2841', title: 'Fire alarm panel showing fault', client: 'Orbit Manufacturing · Noida', person: 'Ajay Sharma', initials: 'AS', priority: 'Critical', status: 'In progress', updated: '18 min ago' },
  { id: 'DK-2838', title: 'Emergency light replacement request', client: 'ABC Towers · Gurgaon', person: 'Unassigned', initials: '?', priority: 'High', status: 'Unassigned', updated: '45 min ago' },
  { id: 'DK-2835', title: 'Quarterly extinguisher service', client: 'Riverside Hospital · Delhi', person: 'Team Bravo', initials: 'TB', priority: 'Normal', status: 'In progress', updated: '1 hr ago' },
  { id: 'DK-2829', title: 'Sprinkler pressure fluctuation', client: 'Maple Residences · Faridabad', person: 'Meera Verma', initials: 'MV', priority: 'High', status: 'Resolved', updated: 'Yesterday' }
];
const people = [
  ['Ajay Sharma','Senior Service Engineer','Team Alpha','Orbit Manufacturing','On site','AS','blue'],
  ['Meera Verma','Fire Safety Engineer','Team Alpha','ABC Towers','On site','MV','green'],
  ['Prateek Singh','Electrician','Team Bravo','Riverside Hospital','Available','PS','gold'],
  ['Nisha Kapoor','Project Coordinator','Operations','Office','Available','NK','purple'],
  ['Deepak Yadav','Technician','Team Bravo','Off duty','Offline','DY','blue']
];
const works = [
  ['ABC Towers','Annual fire safety audit','Gurgaon','72','Due 24 Oct','Team Alpha'],
  ['Maple Residences','Fire system installation','Faridabad','48','Due 30 Oct','Team Bravo'],
  ['Riverside Hospital','Electrical maintenance AMC','Delhi','85','Due 22 Oct','Team Bravo']
];
const clients = [
  ['ABC Towers','Gurgaon','4','2','Active AMC'],['Orbit Manufacturing','Noida','2','1','Active AMC'],['Riverside Hospital','Delhi','3','1','Renewal due']
];
const attendance = [
  {name:'Ajay Sharma', initials:'AS', role:'Senior Service Engineer', rate:1450, days:9, today:'Present', color:'blue'},
  {name:'Meera Verma', initials:'MV', role:'Fire Safety Engineer', rate:1350, days:10, today:'Present', color:'green'},
  {name:'Prateek Singh', initials:'PS', role:'Electrician', rate:950, days:8, today:'Present', color:'gold'},
  {name:'Deepak Yadav', initials:'DY', role:'Technician', rate:850, days:7.5, today:'Half day', color:'blue'},
  {name:'Pawan Kumar', initials:'PK', role:'Fire Technician', rate:925, days:8, today:'Present', color:'purple'}
];
const money = amount => '₹' + amount.toLocaleString('en-IN');
const priorityClass = p => p.toLowerCase();
const statusClass = s => s === 'In progress' ? 'progress' : s.toLowerCase();
document.getElementById('priorityTickets').innerHTML = tickets.slice(0,3).map(t => `<article class="ticket-row"><div class="ticket-icon">!</div><div><h3>${t.title}</h3><p>${t.id} · ${t.client}</p></div><span class="priority ${priorityClass(t.priority)}">${t.priority}</span><span class="status ${statusClass(t.status)}">${t.status}</span></article>`).join('');
document.getElementById('ticketTable').innerHTML = tickets.map(t => `<tr><td><span class="ticket-id">${t.id}</span><span class="row-title">${t.title}</span></td><td>${t.client}</td><td><div class="user-cell"><span class="avatar tiny-avatar avatar-${t.initials === 'MV' ? 'green' : t.initials === 'AS' ? 'blue' : 'gold'}">${t.initials}</span>${t.person}</div></td><td><span class="priority ${priorityClass(t.priority)}">${t.priority}</span></td><td><span class="status ${statusClass(t.status)}">${t.status}</span></td><td>${t.updated}</td></tr>`).join('');
document.getElementById('peopleTable').innerHTML = people.map(p => `<tr><td><div class="user-cell"><span class="avatar tiny-avatar avatar-${p[6]}">${p[5]}</span><span><span class="row-title">${p[0]}</span><span class="table-sub">${p[1]}</span></span></div></td><td>${p[1]}</td><td>${p[2]}</td><td>${p[3]}</td><td><span class="status ${p[4] === 'Offline' ? 'unassigned' : p[4] === 'Available' ? 'resolved' : 'progress'}">${p[4]}</span></td><td>•••</td></tr>`).join('');
document.getElementById('workCards').innerHTML = works.map((w,i) => `<article class="work-card"><div class="card-top"><span class="status progress">ACTIVE</span><button class="more-button">•••</button></div><h2>${w[0]}</h2><p>${w[1]} · ${w[2]}</p><div class="progress-track"><i style="width:${w[3]}%"></i></div><div class="work-meta"><span>${w[3]}% complete</span><strong>${w[4]}</strong></div><div class="card-footer"><div class="stack-avatars"><span class="avatar tiny-avatar avatar-blue">AS</span><span class="avatar tiny-avatar avatar-green">MV</span></div><span>${w[5]} →</span></div><button class="evidence-button" data-evidence="${w[0]}">Close work & add proof</button></article>`).join('');
document.getElementById('clientCards').innerHTML = clients.map(c => `<article class="client-card"><div class="card-top"><span class="status ${c[4] === 'Renewal due' ? 'unassigned' : 'resolved'}">${c[4]}</span><button class="more-button">•••</button></div><h2>${c[0]}</h2><p>⌖ ${c[1]}</p><div class="client-stat"><div><strong>${c[2]}</strong> Active sites</div><div><strong>${c[3]}</strong> Open tickets</div></div><div class="card-footer"><span>View client profile</span><span>→</span></div></article>`).join('');
const renderAttendance = () => { document.getElementById('attendanceTable').innerHTML = attendance.map(a => `<tr><td><div class="user-cell"><span class="avatar tiny-avatar avatar-${a.color}">${a.initials}</span><span><span class="row-title">${a.name}</span><span class="table-sub">Contract resource</span></span></div></td><td>${a.role}</td><td class="wage-value">${money(a.rate)}<span class="table-sub">per day</span></td><td><span class="present-day">${a.days} days</span></td><td class="wage-value">${money(a.rate * a.days)}</td><td><span class="status ${a.today === 'Present' ? 'resolved' : 'progress'}">${a.today}</span></td></tr>`).join(''); const total = attendance.reduce((sum, a) => sum + a.rate * a.days, 0); document.getElementById('payrollTotal').textContent = money(total); document.getElementById('payrollFooter').textContent = money(total) + ' payable'; };
renderAttendance();
document.querySelectorAll('[data-view]').forEach(link => link.addEventListener('click', e => { e.preventDefault(); const target = link.dataset.view; document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(target).classList.add('active'); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); document.querySelectorAll(`[data-view="${target}"]`).forEach(n => n.classList.add('active')); document.getElementById('pageTitle').textContent = link.textContent.trim().replace(/\d+/g,''); document.getElementById('sidebar').classList.remove('open'); window.scrollTo(0,0); }));
const modal = document.getElementById('ticketModal');
document.querySelectorAll('#newTicketButton,#newTicketButton2').forEach(b => b.addEventListener('click', () => { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); }));
document.getElementById('closeModal').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', e => { if(e.target === modal) modal.classList.remove('open'); });
modal.querySelector('form').addEventListener('submit', e => { e.preventDefault(); modal.classList.remove('open'); alert('Service ticket created and ready for assignment.'); });
document.getElementById('menuButton').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
const attendanceModal = document.getElementById('attendanceModal');
document.getElementById('markAttendance').addEventListener('click', () => attendanceModal.classList.add('open'));
document.getElementById('closeAttendanceModal').addEventListener('click', () => attendanceModal.classList.remove('open'));
attendanceModal.addEventListener('click', e => { if(e.target === attendanceModal) attendanceModal.classList.remove('open'); });
attendanceModal.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const resource = attendance[+document.getElementById('attendanceResource').value]; const status = document.getElementById('attendanceStatus').value; resource.today = status; if (status === 'Present') resource.days += 1; if (status === 'Half day') resource.days += .5; renderAttendance(); attendanceModal.classList.remove('open'); });
const evidenceModal = document.getElementById('evidenceModal'); const evidenceTime = document.getElementById('evidenceTime'); const evidenceLocation = document.getElementById('evidenceLocation'); const locationStatus = document.getElementById('locationStatus');
const openEvidence = () => { evidenceTime.textContent = new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}); evidenceLocation.textContent = 'Location unavailable'; locationStatus.textContent = 'Requesting device location only for this site-completion proof.'; evidenceModal.classList.add('open'); if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => { evidenceLocation.textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`; locationStatus.textContent = 'Location captured from this device.'; }, () => { locationStatus.textContent = 'Location permission was not granted. Completion can be submitted with the recorded timestamp.'; }, {enableHighAccuracy:true,timeout:8000}); else locationStatus.textContent = 'This device does not support location capture.'; };
document.querySelectorAll('[data-evidence]').forEach(btn => btn.addEventListener('click', openEvidence));
document.getElementById('closeEvidenceModal').addEventListener('click', () => evidenceModal.classList.remove('open'));
evidenceModal.addEventListener('click', e => { if(e.target === evidenceModal) evidenceModal.classList.remove('open'); });
document.getElementById('siteImages').addEventListener('change', e => { const preview = document.getElementById('photoPreview'); preview.innerHTML = ''; [...e.target.files].slice(0,4).forEach(file => { const img = document.createElement('img'); img.src = URL.createObjectURL(file); img.alt = 'Work completion image'; preview.appendChild(img); }); });
evidenceModal.querySelector('form').addEventListener('submit', e => { e.preventDefault(); evidenceModal.classList.remove('open'); alert('Completion record saved with timestamp, photos, and available location data.'); });

const roles = [
  ['Operations Manager','Tickets · Site work · Resources · Approvals',['Dispatch','Approve work','Manage teams']],
  ['Service Manager','Tickets · Work reports · AMC visits',['Manage tickets','View reports']],
  ['Accounts Manager','Payroll · Invoices · Customer documents',['Approve payroll','Invoices']],
  ['Sales Manager','New enquiries · Quotations · Clients',['Clients','Quotations']]
];
document.getElementById('rolesList').innerHTML = roles.map(r => `<div class="role-row"><div><strong>${r[0]}</strong><small>${r[1]}</small></div><div class="permission-pills">${r[2].map(p => `<span>${p}</span>`).join('')}</div></div>`).join('');

const roleSwitcher = document.getElementById('roleSwitcher');
const adminShell = document.querySelector('.app-shell');
const portalViews = document.querySelectorAll('.portal-view');
const navItems = document.querySelectorAll('.nav-item');
function setRole(role) {
  portalViews.forEach(v => v.classList.remove('active'));
  if (role === 'admin') {
    adminShell.classList.remove('portal-mode');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('dashboard').classList.add('active');
    navItems.forEach(n => n.classList.toggle('active', n.dataset.view === 'dashboard'));
    document.getElementById('pageTitle').textContent = 'Operations overview';
  } else {
    adminShell.classList.add('portal-mode');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(role + 'Portal').classList.add('active');
    document.getElementById('pageTitle').textContent = role === 'manager' ? 'Manager workspace' : role === 'resource' ? 'Field resource app' : 'Customer portal';
  }
  window.scrollTo(0,0);
}
roleSwitcher.addEventListener('change', () => setRole(roleSwitcher.value));
document.querySelector('.evidence-resource').addEventListener('click', openEvidence);
document.getElementById('checkOutButton').addEventListener('click', e => { e.currentTarget.textContent = 'Checked out'; e.currentTarget.disabled = true; });
document.getElementById('customerRequest').addEventListener('click', () => { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); });
document.getElementById('addRole').addEventListener('click', () => alert('Role creation flow: choose a role name, select modules, then assign users.'));

const bankAccounts = [
  {bank:'HDFC Bank', type:'Current account', suffix:'3408', active:true},
  {bank:'ICICI Bank', type:'Current account', suffix:'9124', active:false},
  {bank:'Axis Bank', type:'Collection account', suffix:'5842', active:false}
];
const renderBanks = () => {
  document.getElementById('bankAccounts').innerHTML = bankAccounts.map((b,i) => `<div class="bank-account ${b.active ? 'active' : ''}"><div class="bank-icon">₹</div><div><strong>${b.bank} · ${b.type}</strong><small>Account ending ${b.suffix}${b.active ? ' · Active for payments' : ''}</small></div><button data-bank="${i}">${b.active ? 'Active' : 'Set active'}</button></div>`).join('');
  document.getElementById('bankCount').textContent = bankAccounts.length;
  document.getElementById('activeBankLabel').textContent = `${bankAccounts.find(b=>b.active).bank.replace(' Bank','')} · ${bankAccounts.find(b=>b.active).suffix}`;
  document.querySelectorAll('[data-bank]').forEach(btn => btn.addEventListener('click', () => { bankAccounts.forEach((b,i) => b.active = i === +btn.dataset.bank); renderBanks(); }));
};
renderBanks();
document.getElementById('addBankAccount').addEventListener('click', () => { if(bankAccounts.length >= 10) { alert('You can configure a maximum of 10 receiving bank accounts.'); return; } bankAccounts.push({bank:'New receiving bank',type:'Verification required',suffix:'0000',active:false}); renderBanks(); });

const kycResources = [
  ['Ajay Sharma','Aadhaar & PAN verified','HDFC · 4821','Granted','Verified','blue'],
  ['Meera Verma','Aadhaar & PAN verified','ICICI · 0934','Granted','Verified','green'],
  ['Prateek Singh','PAN pending','Bank pending','Not received','Action required','gold'],
  ['Deepak Yadav','Aadhaar verified','Axis · 2209','Granted','In review','blue'],
  ['Pawan Kumar','Aadhaar & PAN verified','HDFC · 7740','Granted','Verified','purple']
];
document.getElementById('kycTable').innerHTML = kycResources.map(r => `<tr><td><div class="user-cell"><span class="avatar tiny-avatar avatar-${r[5]}">${r[0].split(' ').map(x=>x[0]).join('')}</span><span class="row-title">${r[0]}</span></div></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td><span class="status ${r[4]==='Verified'?'resolved':r[4]==='In review'?'progress':'unassigned'}">${r[4]}</span></td></tr>`).join('');
document.getElementById('inviteKyc').addEventListener('click', () => alert('KYC invitation flow opened: the resource will submit identity, PAN, bank proof, selfie, and consent via their secure portal.'));

const siteMaterials = [
  ['ABC Towers · Fire safety audit','₹92,000 planned','₹68,400 used',74],
  ['Maple Residences · Installation','₹1,46,000 planned','₹93,600 used',64],
  ['Riverside Hospital · AMC','₹68,000 planned','₹51,000 used',75]
];
document.getElementById('siteMaterials').innerHTML = siteMaterials.map(s => `<div class="site-material-row"><div><strong>${s[0]}</strong><small>${s[1]} · ${s[2]}</small><div class="material-bar"><i style="width:${s[3]}%"></i></div></div><b>${s[3]}%</b></div>`).join('');
const quotes = [
  ['Q-1048','ABC Towers · Tower A','Emergency lighting replacement','₹48,500','₹12,125 paid','Approved'],
  ['Q-1047','Orbit Manufacturing · Noida','Fire alarm panel repair','₹26,800','₹0 pending','Sent'],
  ['Q-1045','Riverside Hospital · Delhi','AMC renewal','₹1,24,000','₹31,000 paid','Approved']
];
document.getElementById('quoteTable').innerHTML = quotes.map(q => `<tr><td><span class="ticket-id">${q[0]}</span></td><td>${q[1]}</td><td>${q[2]}</td><td class="wage-value">${q[3]}</td><td>${q[4]}</td><td><span class="status ${q[5]==='Approved'?'resolved':'progress'}">${q[5]}</span></td></tr>`).join('');
document.getElementById('barcodeIssue').addEventListener('click', () => alert('Barcode issue flow: scan the material, select site and resource, record quantity, then confirm the stock issue.'));
document.getElementById('createQuote').addEventListener('click', () => alert('Quotation flow: select client and site, add scope and material/labour items, choose the first-payment amount, then send for customer approval.'));
document.getElementById('changeBranch').addEventListener('click', () => alert('Customer locations: add a branch/site address, set its service contact, and share the live location at the time of service booking.'));

document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => alert(button.dataset.toast)));
document.getElementById('aiQuote').addEventListener('click', () => alert('AI quotation draft: enter site inspection details, required materials, labour level, and service scope. The draft must be reviewed and approved by an authorised DeepKamal manager before it reaches a client.'));
document.getElementById('fieldBarcode').addEventListener('click', () => alert('Material record: scan each barcode when issuing, utilising, returning, or reporting damaged material.')); 
document.getElementById('openChat').addEventListener('click', () => alert('Team chat opened in demo mode. Production messaging should retain job-linked messages and escalation records.'));
document.getElementById('trackVisit').addEventListener('click', () => alert('Live ETA demo: Ajay is 2.4 km away with an estimated arrival in 18 minutes.')); 
document.getElementById('scanQr').addEventListener('click', () => alert('Equipment QR scanner: use the device camera to load the selected asset’s installation record, service history, warranty, and next due date.'));
document.getElementById('shareReferral').addEventListener('click', () => alert('Referral link copied in demo mode. Production will create a unique tracked referral link and apply service credit after a qualifying first order.'));

const services = [
  ['♨','Fire safety audit','Certified inspection and compliance report',7500],
  ['⚡','Electrical maintenance','Preventive maintenance visit for your site',4800],
  ['◉','Fire alarm service','Fault inspection and standard servicing',3500],
  ['▣','Fire extinguisher AMC','Annual maintenance cover per site',12000],
  ['◌','Emergency site visit','Priority technician dispatch',2500],
  ['◫','New installation survey','Survey and proposal for a new system',1500]
];
let cart = [];
document.getElementById('serviceCatalog').innerHTML = services.map((s,i) => `<article class="catalog-card"><div class="catalog-icon">${s[0]}</div><h3>${s[1]}</h3><p>${s[2]}</p><footer><strong>${money(s[3])}</strong><button data-order="${i}">Order service</button></footer></article>`).join('');
const checkoutModal = document.getElementById('checkoutModal');
const startCheckout = index => { const service = services[index]; cart.push(service); document.getElementById('cartCount').textContent = cart.length; document.getElementById('checkoutService').textContent = service[1]; document.getElementById('checkoutAmount').textContent = money(service[3]); checkoutModal.classList.add('open'); };
document.querySelectorAll('[data-order]').forEach(btn => btn.addEventListener('click', () => startCheckout(+btn.dataset.order)));
document.getElementById('closeCheckout').addEventListener('click', () => checkoutModal.classList.remove('open'));
checkoutModal.addEventListener('click', e => { if(e.target === checkoutModal) checkoutModal.classList.remove('open'); });
checkoutModal.querySelector('form').addEventListener('submit', e => { e.preventDefault(); checkoutModal.classList.remove('open'); alert('Demo checkout confirmed. In production, this button will open your payment gateway’s hosted secure payment page.'); });
let claimsThisMonth = 1;
document.getElementById('salaryClaim').addEventListener('click', e => { if(claimsThisMonth >= 3) { alert('You have reached the maximum of 3 salary claims this month.'); return; } claimsThisMonth += 1; e.currentTarget.textContent = 'Claim submitted'; e.currentTarget.disabled = true; document.getElementById('claimRuleText').textContent = `Claim submitted · ${3 - claimsThisMonth} claim${3 - claimsThisMonth === 1 ? '' : 's'} remaining this month`; });

document.querySelectorAll('[data-login-role]').forEach(button => button.addEventListener('click', () => {
  const role = button.dataset.loginRole;
  roleSwitcher.value = role;
  document.getElementById('loginScreen').classList.add('hidden');
  setRole(role);
}));

const directPortal = new URLSearchParams(window.location.search).get('portal');
if (['admin', 'resource', 'customer'].includes(directPortal)) {
  roleSwitcher.value = directPortal;
  document.getElementById('loginScreen').classList.add('hidden');
  setRole(directPortal);
}

const demoCredentials = [
  ['Super Admin','owner@deepkamal.demo · DK-Owner-2026'],
  ['Sub Admin','manager@deepkamal.demo · DK-Manager-2026'],
  ['Worker / Resource','worker@deepkamal.demo · DK-Worker-2026'],
  ['Client','client@deepkamal.demo · DK-Client-2026']
];
document.getElementById('credentialList').innerHTML = demoCredentials.map(c => `<div class="credential-item"><span>${c[0]}</span><code>${c[1]}</code></div>`).join('');

const feedbackModal = document.getElementById('feedbackModal');
let selectedRating = 0;
const openFeedback = () => feedbackModal.classList.add('open');
document.getElementById('openFeedback').addEventListener('click', openFeedback);
document.getElementById('feedbackButton').addEventListener('click', openFeedback);
document.getElementById('closeFeedback').addEventListener('click', () => feedbackModal.classList.remove('open'));
feedbackModal.addEventListener('click', e => { if(e.target === feedbackModal) feedbackModal.classList.remove('open'); });
document.querySelectorAll('[data-rating]').forEach(star => star.addEventListener('click', () => { selectedRating = +star.dataset.rating; document.querySelectorAll('[data-rating]').forEach(s => s.classList.toggle('selected', +s.dataset.rating <= selectedRating)); }));
feedbackModal.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (!selectedRating) { alert('Please select a star rating before submitting your feedback.'); return; } document.getElementById('feedbackRating').textContent = `${selectedRating}.0`; document.getElementById('feedbackStatus').textContent = `Thank you — feedback submitted for ticket DK-2792`; feedbackModal.classList.remove('open'); });
