// =====================================================
//  KING WASH
//  Car Wash Management System
//  TypeScript-style JavaScript
// =====================================================

// -------- Data Types (TS-style comments) --------
// interface Car { id, name, color, colorHex, plateNumber, size('large'|'small'),
//   entryTime, exitTime, status('active'|'done'), customerType('cash'|'monthly'),
//   customerId, price, note, date }
// interface Customer { id, name, phone, type('cash'|'monthly'),
//   monthlyFee, startDate, endDate, note, totalWashes }
// interface Expense { id, description, category, amount, date, note }

// -------- Storage Keys --------
const KEYS = {
  cars: 'cw_cars',
  customers: 'cw_customers',
  expenses: 'cw_expenses',
  categories: 'cw_categories',
  payments: 'cw_payments',
  users: 'cw_users',
  session: 'cw_session',
};

// -------- Firebase Sync --------
let _db = null;
const _FB_COL = 'kingwash';
const _SYNC_KEYS = ['cw_cars', 'cw_customers', 'cw_expenses', 'cw_categories', 'cw_payments', 'cw_users'];

async function initFirebaseSync() {
  if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG ||
      window.FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    _db = firebase.firestore();
    // Pull latest data from Firestore on startup
    for (const key of _SYNC_KEYS) {
      const snap = await _db.collection(_FB_COL).doc(key).get();
      if (snap.exists()) {
        const items = snap.data().items || [];
        localStorage.setItem(key, JSON.stringify(items));
      }
    }
    // Real-time listeners: auto-refresh when another device saves
    _SYNC_KEYS.forEach(key => {
      _db.collection(_FB_COL).doc(key).onSnapshot(snap => {
        if (!snap.exists()) return;
        const items = snap.data().items || [];
        const newStr = JSON.stringify(items);
        if (newStr !== localStorage.getItem(key)) {
          localStorage.setItem(key, newStr);
          _refreshCurrentPage();
        }
      });
    });
    console.log('[KING WASH] Firebase sync چالاک بوو');
  } catch (err) {
    console.warn('[KING WASH] Firebase sync هەڵە:', err.message);
  }
}

function _pushToFirestore(key, data) {
  if (!_db) return;
  _db.collection(_FB_COL).doc(key)
    .set({ items: data, updatedAt: new Date().toISOString() })
    .catch(err => console.warn('[Firebase push]', err.message));
}

function _refreshCurrentPage() {
  if (!_currentPage) return;
  if (_currentPage === 'dashboard')      renderDashboard();
  if (_currentPage === 'activeCars')     renderActiveCars();
  if (_currentPage === 'history')        renderHistory();
  if (_currentPage === 'customers')      renderCustomers();
  if (_currentPage === 'expenses')       renderExpenses();
  if (_currentPage === 'monthlyBilling') renderMonthlyBilling();
  if (_currentPage === 'users')          renderUsers();
}

// -------- Auth --------
const USER_PAGES  = ['newCar', 'activeCars', 'customers']; // pages user role can access
const ADMIN_PAGES = ['dashboard', 'newCar', 'activeCars', 'customers', 'monthlyBilling', 'history', 'expenses', 'reports', 'users'];

function getUsers() {
  let users = getAll(KEYS.users);
  // ensure default admin always exists
  if (!users.find(u => u.username === 'admin')) {
    users.push({ id: 'default_admin', username: 'admin', password: 'admin123', role: 'admin', createdAt: todayStr() });
    saveAll(KEYS.users, users);
  }
  return users;
}

function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem(KEYS.session) || 'null'); }
  catch { return null; }
}

function isAdmin() {
  const u = getCurrentUser();
  return u && u.role === 'admin';
}

function doLogin() {
  const username = (document.getElementById('loginUsername').value || '').trim();
  const password = (document.getElementById('loginPassword').value || '').trim();
  const errEl    = document.getElementById('loginError');
  errEl.classList.add('d-none');

  if (!username || !password) { errEl.textContent = 'ناو و وشەی نهێنی بنووسە'; errEl.classList.remove('d-none'); return; }

  const users = getUsers();
  const user  = users.find(u => u.username === username && u.password === password);
  if (!user) { errEl.textContent = 'ناو یان وشەی نهێنی هەڵەیە'; errEl.classList.remove('d-none'); return; }

  sessionStorage.setItem(KEYS.session, JSON.stringify({ id: user.id, username: user.username, role: user.role }));
  document.getElementById('loginScreen').style.display = 'none';
  applyRoleUI();
  showPage(user.role === 'admin' ? 'dashboard' : 'newCar');
}

function doLogout() {
  sessionStorage.removeItem(KEYS.session);
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').classList.add('d-none');
  document.getElementById('loginScreen').style.display = '';
}

function applyRoleUI() {
  const user  = getCurrentUser();
  if (!user) return;
  const admin = user.role === 'admin';

  // navbar user badge
  document.getElementById('navUserBadge').classList.remove('d-none');
  document.getElementById('navUsername').textContent = user.username + (admin ? ' 👑' : '');

  // admin-only elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = admin ? '' : 'none';
  });

  // btn-more: show for admin only on mobile
  const btnMore = document.getElementById('btn-more');
  if (btnMore) {
    if (admin) btnMore.classList.remove('menu-hidden');
    else       btnMore.classList.add('menu-hidden');
  }

  // bottom nav — hide restricted buttons for user role
  const allNavBtns = { dashboard:'btn-dashboard', history:'btn-history', monthlyBilling:'btn-monthlyBilling', reports:'btn-reports', expenses:'btn-expenses' };
  Object.entries(allNavBtns).forEach(([page, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = (!admin && !USER_PAGES.includes(page)) ? 'none' : '';
  });
}

// -------- Users Page --------
function renderUsers() {
  const users = getUsers();
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  const current = getCurrentUser();

  tbody.innerHTML = users.map((u, i) => {
    const isCurrentUser = current && current.id === u.id;
    const roleBadge = u.role === 'admin'
      ? '<span class="badge bg-danger"><i class="bi bi-shield-fill-check me-1"></i>ئەدمین</span>'
      : '<span class="badge bg-primary"><i class="bi bi-person-fill me-1"></i>یوزەر</span>';
    return `<tr>
      <td>${i + 1}</td>
      <td class="fw-bold">${u.username} ${isCurrentUser ? '<span class="badge bg-secondary">ئەتۆ</span>' : ''}</td>
      <td>${roleBadge}</td>
      <td><small class="text-muted">${u.createdAt || '---'}</small></td>
      <td class="text-center">
        ${isCurrentUser || u.id === 'default_admin'
          ? '<span class="text-muted small">---</span>'
          : `<button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteUser('${u.id}')"><i class="bi bi-trash"></i></button>`}
      </td>
    </tr>`;
  }).join('');
}

function submitAddUser(e) {
  e.preventDefault();
  const username = document.getElementById('newUserName').value.trim();
  const password = document.getElementById('newUserPass').value.trim();
  const roleEl   = document.querySelector('input[name="newUserRole"]:checked');
  if (!roleEl) { showToast('رۆل هەڵبژێرە', 'danger'); return; }

  const users = getUsers();
  if (users.find(u => u.username === username)) { showToast('ئەم ناوە پێشتر تۆمار کراوە', 'danger'); return; }

  users.push({ id: genId(), username, password, role: roleEl.value, createdAt: todayStr() });
  saveAll(KEYS.users, users);
  closeModal('addUserModal');
  e.target.reset();
  showToast('✔ بەکارهێنەرەکە زیاد کرا', 'success');
  renderUsers();
}

function deleteUser(id) {
  if (!confirm('دڵنیایت لە سڕینەوەی ئەم بەکارهێنەرە؟')) return;
  let users = getAll(KEYS.users);
  users = users.filter(u => u.id !== id);
  saveAll(KEYS.users, users);
  showToast('بەکارهێنەرەکە سڕایەوە', 'warning');
  renderUsers();
}

const PRICES = { large: 15000, small: 10000 };

// -------- Built-in categories --------
const BUILTIN_CATS = [
  { id: 'large', name: 'سەیارەی گەورە', price: 15000, icon: 'bi-truck',     color: 'primary', builtin: true },
  { id: 'small', name: 'سەیارەی بچووک', price: 10000, icon: 'bi-car-front', color: 'success', builtin: true },
];

function getCategories() {
  const custom = getAll(KEYS.categories);
  return [...BUILTIN_CATS, ...custom];
}

function saveCustomCategories(list) {
  saveAll(KEYS.categories, list.filter(c => !c.builtin));
}

// -------- Helpers --------
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getAll(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveAll(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  _pushToFirestore(key, data);
}

function formatNum(n) {
  return Number(n).toLocaleString('en-US');
}

function formatDatetime(dt) {
  if (!dt) return '---';
  const d = new Date(dt);
  return d.toLocaleDateString('ar-IQ') + ' ' + d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function elapsedTime(start) {
  const ms = Date.now() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs  = Math.floor(mins / 60);
  const m    = mins % 60;
  if (hrs > 0) return `${hrs}کت ${m}خ`;
  return `${m} خولەک`;
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('appToast');
  const toastMsg = document.getElementById('toastMsg');
  toast.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning', 'text-bg-info');
  toast.classList.add('text-bg-' + type);
  toastMsg.textContent = msg;
  const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
  bsToast.show();
}

function openModal(id) {
  const m = new bootstrap.Modal(document.getElementById(id));
  m.show();
}

function closeModal(id) {
  const el = document.getElementById(id);
  const m = bootstrap.Modal.getInstance(el);
  if (m) m.hide();
}

// -------- Clock --------
function updateClock() {
  const el = document.getElementById('currentTime');
  if (el) el.textContent = new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// -------- Today date header --------
(function setTodayDate() {
  const el = document.getElementById('todayDate');
  if (el) el.textContent = new Date().toLocaleDateString('ckb-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
})();

// -------- Page Navigation --------
const pages = ['dashboard', 'newCar', 'activeCars', 'customers', 'monthlyBilling', 'history', 'expenses', 'reports', 'users'];
let _currentPage = '';

function showPage(name) {
  // Role check
  const user = getCurrentUser();
  if (!user) { doLogout(); return; }
  const allowed = user.role === 'admin' ? ADMIN_PAGES : USER_PAGES;
  if (!allowed.includes(name)) {
    showToast('دەستڕاگەیشتن نییە بە ئەم بەشە', 'danger');
    return;
  }

  pages.forEach(p => {
    const pg = document.getElementById('page-' + p);
    if (pg) pg.classList.toggle('active', p === name);
    const sb = document.getElementById('sidebar-btn-' + p);
    if (sb) sb.classList.toggle('active', p === name);
    const mb = document.getElementById('btn-' + p);
    if (mb) mb.classList.toggle('active', p === name);
  });
  if (name === 'dashboard')      renderDashboard();
  if (name === 'activeCars')     renderActiveCars();
  if (name === 'history')        { populateHistorySizeFilter(); renderHistory(); }
  if (name === 'customers')      renderCustomers();
  if (name === 'expenses')       renderExpenses();
  if (name === 'monthlyBilling') renderMonthlyBilling();
  if (name === 'newCar')         initNewCarForm();
  if (name === 'users')          renderUsers();
  _currentPage = name;
}

// -------- Car Size Category Buttons --------
const CAT_COLORS = ['primary','success','danger','warning','info','secondary','dark'];

function renderCarSizeButtons() {
  const cats = getCategories();
  const container = document.getElementById('carSizeBtnsContainer');
  if (!container) return;

  container.innerHTML = cats.map((cat, i) => {
    const col = cat.color || CAT_COLORS[i % CAT_COLORS.length];
    const icon = cat.icon || 'bi-car-front';
    return `
      <div class="col-4 col-md-3">
        <input type="radio" class="btn-check" name="carSize" id="cat_${cat.id}" value="${cat.id}" ${i === 0 ? 'required' : ''} />
        <label class="btn btn-outline-${col} w-100 py-3 car-size-btn" for="cat_${cat.id}">
          <i class="bi ${icon} d-block fs-2 mb-1"></i>
          <strong>${cat.name}</strong>
          <div class="badge bg-${col} mt-1">${formatNum(cat.price)} د.ع</div>
        </label>
      </div>
    `;
  }).join('');

  // re-attach change listeners
  container.querySelectorAll('input[name="carSize"]').forEach(radio => {
    radio.addEventListener('change', updatePricePreview);
  });
}

// -------- Category Management --------
function renderCategoriesList() {
  const cats = getCategories();
  const el = document.getElementById('categoriesList');
  if (!el) return;
  el.innerHTML = cats.map(cat => `
    <div class="d-flex align-items-center justify-content-between border rounded px-3 py-2 mb-2">
      <div class="d-flex align-items-center gap-2">
        <i class="bi ${cat.icon || 'bi-car-front'} text-${cat.color || 'secondary'} fs-5"></i>
        <div>
          <div class="fw-bold">${cat.name}</div>
          <div class="small text-muted">${formatNum(cat.price)} د.ع</div>
        </div>
      </div>
      ${cat.builtin
        ? '<span class="badge bg-light text-muted">ئاسایی</span>'
        : `<button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteCategory('${cat.id}')">
             <i class="bi bi-trash"></i>
           </button>`
      }
    </div>
  `).join('');
}

function submitAddCategory() {
  const name  = document.getElementById('newCatName').value.trim();
  const price = parseInt(document.getElementById('newCatPrice').value) || 0;
  if (!name)  { showToast('ناوی کەتەگۆری بنووسە', 'danger'); return; }
  if (price <= 0) { showToast('نرخ بنووسە', 'danger'); return; }

  const custom = getAll(KEYS.categories);
  custom.push({ id: genId(), name, price, icon: 'bi-car-front', color: CAT_COLORS[custom.length % CAT_COLORS.length], builtin: false });
  saveAll(KEYS.categories, custom);

  document.getElementById('newCatName').value  = '';
  document.getElementById('newCatPrice').value = '';
  renderCategoriesList();
  renderCarSizeButtons();
  showToast('✔ کەتەگۆری زیاد کرا', 'success');
}

function deleteCategory(id) {
  if (!confirm('ئایا دڵنیایت لە سڕینەوەی ئەم کەتەگۆریە؟')) return;
  let custom = getAll(KEYS.categories);
  custom = custom.filter(c => c.id !== id);
  saveAll(KEYS.categories, custom);
  renderCategoriesList();
  renderCarSizeButtons();
  showToast('کەتەگۆریەکە سڕایەوە', 'warning');
}

// -------- New Car Form --------
function initNewCarForm() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('entryTime').value = now.toISOString().slice(0, 16);
  document.getElementById('carForm').reset();
  document.getElementById('entryTime').value = now.toISOString().slice(0, 16);
  document.getElementById('carColorPicker').value = '#cccccc';
  document.getElementById('pricePreview').style.display = 'none';
  document.getElementById('monthlyCustomerDiv').style.display = 'none';

  renderCarSizeButtons();

  // listen to customer type
  document.querySelectorAll('input[name="customerType"]').forEach(radio => {
    radio.addEventListener('change', function () {
      const mm = document.getElementById('monthlyCustomerDiv');
      mm.style.display = this.value === 'monthly' ? 'block' : 'none';
      if (this.value === 'monthly') populateMonthlySelect();
      updatePricePreview();
    });
  });
  // color picker sync
  document.getElementById('carColorPicker').addEventListener('input', function () {
    document.getElementById('carColor').value = colorNameFromHex(this.value);
  });
}

function generateQrFromLookup() {
  const plate = (document.getElementById('qrLookupPlate').value || '').trim();
  if (!plate) { showToast('ژمارەی سەیارە بنووسە', 'warning'); return; }
  // find most recent matching car name
  const all = getAll(KEYS.cars).filter(c => c.plateNumber === plate);
  const name = all.length > 0
    ? all.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0].name
    : plate;
  showCarQR(plate, name);
}

function qrLookupPreview() {
  const plate = (document.getElementById('qrLookupPlate').value || '').trim();
  const info  = document.getElementById('qrLookupInfo');
  if (!plate || plate.length < 2) { info.classList.add('d-none'); return; }
  const all    = getAll(KEYS.cars).filter(c => c.plateNumber === plate);
  const done   = all.filter(c => c.status === 'done').length;
  const active = all.filter(c => c.status === 'active').length;
  if (all.length === 0) {
    info.textContent = 'هیچ تۆمارێک نییە بۆ ئەم پلاکەیە';
    info.className = 'mt-2 small text-danger';
  } else {
    const carName = all.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0].name;
    info.innerHTML = `<i class="bi bi-car-front me-1"></i><strong>${carName}</strong> &mdash; ${done} جار سەردانی کردووە${active ? ' <span class="badge bg-warning text-dark">ئێستا لە ناو غسل</span>' : ''}`;
    info.className = 'mt-2 small text-success';
  }
  info.classList.remove('d-none');
}

// -------- QR Code --------
let _html5QrScanner = null;

function showCarQR(plate, name) {
  const modal = document.getElementById('qrDisplayModal');
  document.getElementById('qrDisplayTitle').textContent = 'QR کۆدی سەیارە';
  document.getElementById('qrDisplayPlate').textContent = plate;

  // visit count (all visits including active)
  const visits = getAll(KEYS.cars).filter(c => c.plateNumber === plate).length;
  document.getElementById('qrDisplaySub').textContent = name + ' — ' + visits + ' جار سەردانی کردوە';

  // clear old QR
  const canvas = document.getElementById('qrCodeCanvas');
  canvas.innerHTML = '';
  new QRCode(canvas, {
    text: plate,
    width: 200,
    height: 200,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });
  new bootstrap.Modal(modal).show();
}

function printQrCode() {
  const plate = document.getElementById('qrDisplayPlate').textContent;
  const sub   = document.getElementById('qrDisplaySub').textContent;
  const img   = document.querySelector('#qrCodeCanvas img');
  if (!img) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>KING WASH - QR - ${plate}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:40px}img{border:2px solid #000;border-radius:8px;padding:10px}.brand{font-size:1.4rem;font-weight:bold;letter-spacing:2px;color:#0d6efd;margin-bottom:8px}</style>
    </head><body>
    <div class="brand">👑 KING WASH</div>
    <img src="${img.src}" width="220" />
    <h2 style="letter-spacing:3px;margin-top:16px">${plate}</h2>
    <p style="color:#666">${sub}</p>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function openQrScanModal() {
  document.getElementById('qrScanResult').classList.add('d-none');
  document.getElementById('qrScanStatus').textContent = 'کەمەرا بەرەکتویە.. QR بخەیبەردە';
  document.getElementById('scanAgainBtn').style.display = 'none';
  document.getElementById('qrScanReader').innerHTML = '';
  const m = new bootstrap.Modal(document.getElementById('qrScanModal'));
  m.show();

  // wait for modal to open then start scanner
  document.getElementById('qrScanModal').addEventListener('shown.bs.modal', _startScanner, { once: true });
  // stop scanner when modal closes
  document.getElementById('qrScanModal').addEventListener('hide.bs.modal', _stopScanner, { once: true });
}

function _startScanner() {
  _html5QrScanner = new Html5Qrcode('qrScanReader');
  _html5QrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    function(decodedText) {
      _stopScanner();
      _showScanResult(decodedText);
    },
    function() { /* ignore scan errors */ }
  ).catch(function(err) {
    document.getElementById('qrScanStatus').textContent = 'کەمەرا نەکرایەوە: ' + err;
  });
}

function _stopScanner() {
  if (_html5QrScanner) {
    _html5QrScanner.stop().catch(() => {});
    _html5QrScanner = null;
  }
}

function _showScanResult(plate) {
  const allCars = getAll(KEYS.cars);
  const visits  = allCars.filter(c => c.plateNumber === plate);
  const total   = visits.length;
  const last    = visits.filter(c => c.status === 'done').length > 0
    ? visits.filter(c => c.status === 'done').slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
    : null;

  document.getElementById('scanResultPlate').textContent = plate;
  document.getElementById('scanResultCount').textContent = total;
  document.getElementById('scanResultLast').textContent  = last
    ? 'کۆتا سەردان: ' + formatDatetime(last.entryTime)
    : 'هیچ تۆمارێک نییە';

  document.getElementById('qrScanResult').classList.remove('d-none');
  document.getElementById('qrScanReader').innerHTML = '';
  document.getElementById('qrScanStatus').textContent = '';
  document.getElementById('scanAgainBtn').style.display = '';
}

function resetQrScan() {
  document.getElementById('qrScanResult').classList.add('d-none');
  document.getElementById('scanAgainBtn').style.display = 'none';
  document.getElementById('qrScanReader').innerHTML = '';
  document.getElementById('qrScanStatus').textContent = 'کەمەرا بەرەکتویە.. QR بخەیبەردە';
  _startScanner();
}

// -------- Plate Auto-fill --------
function autoFillCarByPlate() {
  const plateEl = document.getElementById('carPlate');
  const sugBox  = document.getElementById('plateSuggestions');
  const val     = plateEl.value.trim();

  if (val.length < 2) { sugBox.style.display = 'none'; return; }

  const all  = getAll(KEYS.cars);
  // Find unique plate matches (most recent first)
  const seen = {};
  const matches = [];
  [...all].reverse().forEach(c => {
    const plate = (c.plateNumber || '').trim();
    if (!seen[plate] && plate.toLowerCase().includes(val.toLowerCase())) {
      seen[plate] = true;
      matches.push(c);
    }
  });

  if (matches.length === 0) { sugBox.style.display = 'none'; return; }

  sugBox.innerHTML = matches.slice(0, 6).map(c =>
    `<button type="button" class="list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2"
      onclick="applyPlateSuggestion('${c.plateNumber.replace(/'/g, "&#39;")}','${c.name.replace(/'/g, "&#39;")}','${c.color.replace(/'/g, "&#39;")}','${c.colorHex||'#cccccc'}')">
      <span style="background:${c.colorHex||'#eee'};width:12px;height:12px;border-radius:50%;border:1px solid #ccc;flex-shrink:0"></span>
      <span class="fw-bold">${c.plateNumber}</span>
      <span class="text-muted small">${c.name} &mdash; ${c.color}</span>
    </button>`
  ).join('');
  sugBox.style.display = 'block';
}

function applyPlateSuggestion(plate, name, color, colorHex) {
  document.getElementById('carPlate').value     = plate;
  document.getElementById('carName').value      = name;
  document.getElementById('carColor').value     = color;
  document.getElementById('carColorPicker').value = colorHex;
  document.getElementById('plateSuggestions').style.display = 'none';
}

// Hide suggestions when clicking outside
document.addEventListener('click', function(e) {
  const sug = document.getElementById('plateSuggestions');
  if (sug && !sug.contains(e.target) && e.target.id !== 'carPlate') {
    sug.style.display = 'none';
  }
});

function colorNameFromHex(hex) {
  const map = {
    '#ffffff': 'سپی', '#000000': 'ڕەش', '#ff0000': 'سور', '#00ff00': 'سەوز',
    '#0000ff': 'شین', '#ffff00': 'زەرد', '#ffa500': 'هەڵۆ', '#808080': 'خاکی',
    '#c0c0c0': 'زیو', '#800000': 'مەرجانی', '#008080': 'فیرۆزە', '#800080': 'مۆر',
  };
  return map[hex.toLowerCase()] || hex;
}

function updatePricePreview() {
  const sizeEl     = document.querySelector('input[name="carSize"]:checked');
  const typeEl     = document.querySelector('input[name="customerType"]:checked');
  const preview    = document.getElementById('pricePreview');
  const previewVal = document.getElementById('pricePreviewValue');
  const previewLbl = document.getElementById('pricePreviewLabel');
  if (!sizeEl) { preview.style.display = 'none'; return; }

  const cat = getCategories().find(c => c.id === sizeEl.value);
  if (!cat) { preview.style.display = 'none'; return; }

  const isMonthly = typeEl && typeEl.value === 'monthly';
  const custId    = isMonthly ? (document.getElementById('monthlyCustomerSelect') || {}).value : null;

  if (isMonthly && custId) {
    const cust = getAll(KEYS.customers).find(c => c.id === custId);
    if (cust && cust.categoryPrices && cust.categoryPrices[cat.id]) {
      previewVal.textContent = formatNum(cust.categoryPrices[cat.id]);
      if (previewLbl) previewLbl.textContent = 'نرخی عقدی شوشتن (' + cat.name + '):';
      preview.style.display = 'flex';
      return;
    }
    if (cust && (cust.pricePerWash || cust.monthlyFee)) {
      const pw = cust.pricePerWash || cust.monthlyFee;
      previewVal.textContent = formatNum(pw);
      if (previewLbl) previewLbl.textContent = 'نرخی عقدی شوشتن:';
      preview.style.display = 'flex';
      return;
    }
    // no price configured
    previewVal.textContent = formatNum(cat.price);
    if (previewLbl) previewLbl.textContent = 'نرخی کەتەگۆری (نرخی عقد تۆمار نەکراوە):';
    preview.style.display = 'flex';
  } else {
    previewVal.textContent = formatNum(cat.price);
    if (previewLbl) previewLbl.textContent = 'نرخ:';
    preview.style.display = 'flex';
  }
}

function populateMonthlySelect() {
  const customers = getAll(KEYS.customers).filter(c => c.type === 'monthly');
  const sel = document.getElementById('monthlyCustomerSelect');
  sel.innerHTML = '<option value="">-- کریار هەڵبژێره --</option>';
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name + (c.phone ? ' - ' + c.phone : '');
    sel.appendChild(opt);
  });
}

function submitCar(e) {
  e.preventDefault();
  const sizeEl = document.querySelector('input[name="carSize"]:checked');
  const typeEl = document.querySelector('input[name="customerType"]:checked');
  if (!sizeEl || !typeEl) { showToast('تکایە هەموو خانەکان پڕ بکەوە', 'danger'); return; }

  const catId    = sizeEl.value;
  const custType  = typeEl.value;
  const custId    = custType === 'monthly' ? document.getElementById('monthlyCustomerSelect').value : null;

  const cat = getCategories().find(c => c.id === catId);
  if (!cat) { showToast('تکایە جۆری سەیارە هەڵبژێرە', 'danger'); return; }

  // Determine price: for monthly customers use their per-category price, else category default
  let washPrice = cat.price;
  if (custType === 'monthly' && custId) {
    const cust = getAll(KEYS.customers).find(c => c.id === custId);
    if (cust) {
      // 1. per-category price map (new)
      if (cust.categoryPrices && cust.categoryPrices[catId]) {
        washPrice = cust.categoryPrices[catId];
      // 2. legacy single pricePerWash
      } else if (cust.pricePerWash || cust.monthlyFee) {
        washPrice = cust.pricePerWash || cust.monthlyFee;
      }
      // 3. else fallback: category default price (already set above)
    }
  }

  /** @type {any} */
  const car = {
    id: genId(),
    name: document.getElementById('carName').value.trim(),
    color: document.getElementById('carColor').value.trim(),
    colorHex: document.getElementById('carColorPicker').value,
    plateNumber: document.getElementById('carPlate').value.trim(),
    size: catId,
    sizeLabel: cat.name,
    entryTime: document.getElementById('entryTime').value,
    exitTime: null,
    status: 'active',
    customerType: custType,
    customerId: custId || null,
    price: washPrice,
    note: document.getElementById('carNote').value.trim(),
    date: todayStr(),
    createdBy: getCurrentUser() ? getCurrentUser().username : 'نەزانراو',
  };

  const cars = getAll(KEYS.cars);
  cars.push(car);
  saveAll(KEYS.cars, cars);

  showToast('✔ سەیارەکە تۆمار کرا و چووەتە ناو غسل', 'success');
  document.getElementById('carForm').reset();
  document.getElementById('pricePreview').style.display = 'none';
  document.getElementById('monthlyCustomerDiv').style.display = 'none';
  showPage('activeCars');
}

// -------- Active Cars --------
let exitCarId = null;

function renderActiveCars() {
  const cars = getAll(KEYS.cars).filter(c => c.status === 'active');
  const container = document.getElementById('activeCarsGrid');
  const badge = document.getElementById('activeCountBadge');
  if (badge) badge.textContent = cars.length;

  if (cars.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center text-muted py-5">
        <i class="bi bi-car-front" style="font-size:3rem"></i>
        <p class="mt-2">هیچ سەیارەیەک لە ناو غسل نییە</p>
      </div>`;
    return;
  }

  container.innerHTML = cars.map(car => {
    const isLarge   = car.size === 'large';
    const isSmall   = car.size === 'small';
    const sizeLabel = car.sizeLabel || (isLarge ? 'گەورە' : isSmall ? 'بچووک' : (car.size || 'تر').replace('other:', ''));
    const sizeColor = isLarge ? 'bg-primary' : isSmall ? 'bg-success' : 'bg-secondary';
    return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="car-card">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <span class="fw-bold fs-5">${car.name}</span>
            <span class="car-color-dot ms-2" style="background:${car.colorHex || '#eee'}"></span>
            <span class="text-muted small">${car.color}</span>
          </div>
          <span class="badge ${sizeColor}">${sizeLabel}</span>
        </div>
        <div class="car-info-row">
          <i class="bi bi-credit-card text-muted"></i>
          <span class="fw-bold" style="letter-spacing:1px">${car.plateNumber}</span>
        </div>
        <div class="car-info-row">
          <i class="bi bi-clock text-muted"></i>
          <span class="text-muted small">${formatDatetime(car.entryTime)}</span>
        </div>
        <div class="car-info-row mb-2">
          <i class="bi bi-person text-muted"></i>
          <span class="badge ${car.customerType === 'cash' ? 'bg-warning text-dark' : 'bg-info text-dark'}">
            ${car.customerType === 'cash' ? 'نقد' : 'مانگانە'}
          </span>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="timer-badge" id="timer-${car.id}">${elapsedTime(car.entryTime)}</span>
          <div class="d-flex gap-2">
            <span class="fw-bold text-success">${formatNum(car.price)} د.ع</span>
            <button class="btn btn-outline-dark btn-sm" onclick="showCarQR('${car.plateNumber.replace(/'/g, "&#39;")}','${car.name.replace(/'/g, "&#39;")}')" title="QR کۆد">
              <i class="bi bi-qr-code"></i>
            </button>
            <button class="btn btn-outline-secondary btn-sm" onclick="printCarReceipt('${car.id}')" title="چاپکردنی وەسڵ">
              <i class="bi bi-printer"></i>
            </button>
            <button class="btn btn-success btn-sm" onclick="confirmExit('${car.id}')">
              <i class="bi bi-box-arrow-right"></i> دەرچوون
            </button>
          </div>
        </div>
        ${car.note ? `<div class="mt-2 text-muted small"><i class="bi bi-sticky me-1"></i>${car.note}</div>` : ''}
      </div>
    </div>
  `}).join('');

  // Update timers every minute
  setTimeout(() => {
    cars.forEach(car => {
      const el = document.getElementById('timer-' + car.id);
      if (el) el.textContent = elapsedTime(car.entryTime);
    });
  }, 60000);
}

function confirmExit(carId) {
  const cars = getAll(KEYS.cars);
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  exitCarId = carId;

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const exitVal = now.toISOString().slice(0, 16);
  const elapsed = elapsedTime(car.entryTime);

  document.getElementById('exitModalBody').innerHTML = `
    <div class="mb-3">
      <h6 class="text-muted mb-1">زانیاری سەیارە</h6>
      <div class="d-flex gap-2 align-items-center mb-2">
        <span class="car-color-dot" style="background:${car.colorHex || '#eee'}; width:18px; height:18px; border-radius:50%; border:1px solid #dee2e6; display:inline-block"></span>
        <strong>${car.name}</strong>
        <span class="badge bg-secondary">${car.plateNumber}</span>
      </div>
      <div class="small text-muted">هاتنی بۆ ناو: ${formatDatetime(car.entryTime)}</div>
      <div class="small text-muted">ماوەی ناوخستن: ${elapsed}</div>
    </div>
    <div class="mb-3">
      <label class="form-label fw-bold">کاتی دەرچوون</label>
      <input type="datetime-local" class="form-control" id="exitTimeInput" value="${exitVal}" />
    </div>
    <div class="alert alert-success d-flex justify-content-between">
      <span>نرخی شوشتن:</span>
      <strong>${formatNum(car.price)} د.ع (${car.customerType === 'cash' ? 'نقد' : 'مانگانە'})</strong>
    </div>
  `;

  const confirmBtn = document.getElementById('confirmExitBtn');
  confirmBtn.onclick = executeExit;
  openModal('exitModal');
}

function executeExit() {
  if (!exitCarId) return;
  const cars = getAll(KEYS.cars);
  const idx = cars.findIndex(c => c.id === exitCarId);
  if (idx === -1) return;

  const exitTimeVal = document.getElementById('exitTimeInput').value;
  cars[idx].exitTime = exitTimeVal;
  cars[idx].status = 'done';
  saveAll(KEYS.cars, cars);

  closeModal('exitModal');
  showToast('✔ سەیارەکە لە غسل دەرچوو و تۆمار کرا', 'success');
  exitCarId = null;
  renderActiveCars();
  renderDashboard();
}

// -------- Print Receipt --------
function printCarReceipt(carId) {
  const car = getAll(KEYS.cars).find(c => c.id === carId);
  if (!car) return;

  const user       = getCurrentUser();
  const cashier    = user ? user.username : 'KingWash';
  const now        = new Date();
  const dateStr    = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB');
  const txId       = '00' + car.id.replace(/-/g, '').slice(0, 12).toUpperCase();
  const payMode    = car.customerType === 'cash' ? 'Cash' : 'Monthly';
  const priceStr   = formatNum(car.price);

  // Generate QR as dataURL using existing QRCode.js
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(tempDiv);
  new QRCode(tempDiv, { text: car.plateNumber, width: 120, height: 120,
    colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });

  setTimeout(() => {
    const canvas   = tempDiv.querySelector('canvas');
    const qrData   = canvas ? canvas.toDataURL() : '';
    document.body.removeChild(tempDiv);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt - ${car.plateNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;width:58mm;margin:0 auto;font-size:10px;color:#000;background:#fff}
  .c{text-align:center}
  .logo-wrap{background:#1a1a1a;border-radius:50%;width:64px;height:64px;display:flex;align-items:center;justify-content:center;margin:4px auto}
  .brand{font-size:13px;font-weight:bold;letter-spacing:3px;margin:2px 0 3px}
  hr{border:none;border-top:1px dashed #000;margin:4px 0}
  .row{display:flex;justify-content:space-between;padding:1px 0;font-size:10px}
  .inv-title{text-align:center;font-size:12px;font-weight:bold;text-decoration:underline;margin:3px 0}
  table{width:100%;border-collapse:collapse}
  table td{padding:1px 0;font-size:10px}
  .total td{border-top:1px solid #000;font-size:12px;font-weight:bold;padding-top:3px}
  .phone{font-size:12px;font-weight:bold;letter-spacing:1px}
  .plate-code{font-size:10px;letter-spacing:2px;margin-top:2px;color:#333}
  .thanks{font-size:10px;margin-top:3px;color:#444}
  @media print{body{width:58mm}@page{size:58mm auto;margin:1mm}}
</style>
</head>
<body>

<!-- Logo -->
<div class="c" style="margin-top:4px">
  <div class="logo-wrap">
    <svg width="44" height="44" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="50" rx="26" ry="4" fill="rgba(255,255,255,0.1)"/>
      <path d="M10 36 Q13 27 20 25 L23 17 Q25 13 30 13 Q35 13 37 17 L40 25 Q47 27 50 36 L50 43 Q50 45 48 45 L12 45 Q10 45 10 43Z" fill="white" stroke="#aaa" stroke-width="0.5"/>
      <rect x="22" y="19" width="16" height="9" rx="2" fill="#87CEEB" opacity="0.6"/>
      <circle cx="19" cy="45" r="5.5" fill="#333"/><circle cx="19" cy="45" r="3" fill="#eee"/>
      <circle cx="41" cy="45" r="5.5" fill="#333"/><circle cx="41" cy="45" r="3" fill="#eee"/>
      <path d="M6 36 Q8 32 12 32 L48 32 Q52 32 54 36" stroke="#ccc" stroke-width="1" fill="none"/>
    </svg>
  </div>
  <div class="brand">KING WASH</div>
</div>

<hr/>

<div style="padding:0 1px">
  <div class="row"><span>KingWash</span><span></span></div>
  <div class="row"><span>Date:</span><span>${dateStr}</span></div>
  <div class="row"><span>Transaction ID:</span><span>${txId}</span></div>
  <div class="row"><span>Terminal ID:</span><span>044449</span></div>
  <div class="row"><span>Cashier Name:</span><span>${cashier}</span></div>
  <div class="row"><span>Payment Mode:</span><span>${payMode}</span></div>
  <div class="row"><span>Car Number:</span><span>${car.plateNumber}</span></div>
  <div class="row"><span>Car Color:</span><span>${car.color}</span></div>
</div>

<hr/>

<div class="inv-title">Invoice</div>

<table style="margin:3px 0">
  <tr><td></td><td style="text-align:right;font-weight:bold">PDR1</td></tr>
  <tr><td>Name</td><td style="text-align:right">${car.name}</td></tr>
  <tr><td>Charges</td><td style="text-align:right">${priceStr} IQD</td></tr>
  <tr><td>Qty</td><td style="text-align:right">1</td></tr>
  <tr><td>Sub Total</td><td style="text-align:right">${priceStr} IQD</td></tr>
  <tr><td colspan="2"><hr/></td></tr>
  <tr><td>You Get Discount</td><td style="text-align:right">0.0 IQD</td></tr>
  <tr class="total"><td><strong>Total</strong></td><td style="text-align:right"><strong>${priceStr} IQD</strong></td></tr>
</table>

<hr/>

<!-- QR Code -->
<div class="c" style="margin:6px 0">
  ${qrData ? `<img src="${qrData}" style="width:90px;height:90px" alt="QR"/>` : ''}
  <div class="plate-code">${car.plateNumber}</div>
</div>

<hr/>

<div class="c" style="margin:4px 0 6px">
  <div class="phone">&#128222; 07503627700</div>
  <div class="thanks">Thank you for your visit</div>
</div>

<script>window.onload=function(){setTimeout(function(){window.print();},300);window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;

    const win = window.open('', '_blank', 'width=300,height=700,scrollbars=yes');
    if (win) { win.document.write(html); win.document.close(); }
    else showToast('پۆپئەپ بلۆک کراوە، تکایە ڕێگە پێبدە', 'warning');
  }, 350);
}

// -------- Dashboard --------
function renderDashboard() {
  const today = todayStr();
  const allCars = getAll(KEYS.cars);
  const allExpenses = getAll(KEYS.expenses);
  const allPayments = getAll(KEYS.payments);

  const todayCars       = allCars.filter(c => c.date === today);
  const activeCars      = allCars.filter(c => c.status === 'active');
  const doneCars        = todayCars.filter(c => c.status === 'done');

  // Only cash customers pay at wash time
  const cashIncome      = doneCars.filter(c => c.customerType === 'cash').reduce((s, c) => s + (c.price || 0), 0);
  // Monthly payments actually collected today (from billing system)
  const monthlyCollectedToday = allPayments.filter(p => p.date === today).reduce((s, p) => s + (p.amount || 0), 0);
  const todayIncome     = cashIncome + monthlyCollectedToday;

  const todayExp        = allExpenses.filter(e => e.date === today).reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit       = todayIncome - todayExp;

  // Monthly contract customers count
  const monthCusts      = getAll(KEYS.customers).filter(c => c.type === 'monthly');
  // Count of monthly customer car washes today (not yet collected)
  const todayMonthlyWashes = doneCars.filter(c => c.customerType === 'monthly').length;

  document.getElementById('stat-today-cars').textContent    = todayCars.length;
  document.getElementById('stat-today-income').textContent  = formatNum(todayIncome);
  document.getElementById('stat-active-cars').textContent   = activeCars.length;
  document.getElementById('stat-today-expenses').textContent= formatNum(todayExp);
  document.getElementById('stat-net-profit').textContent    = formatNum(netProfit) + ' د.ع';
  document.getElementById('stat-monthly-customers').textContent = monthCusts.length;
  // Show today's monthly washes in sub-text if element exists
  const mwEl = document.getElementById('stat-monthly-washes-today');
  if (mwEl) mwEl.textContent = todayMonthlyWashes > 0 ? `+ ${todayMonthlyWashes} شوشتنی مانگانە` : '';

  // Active cars mini-table
  const tbody = document.getElementById('activeCarsDashBody');
  if (activeCars.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">هیچ سەیارەیەک نییە</td></tr>';
  } else {
    tbody.innerHTML = activeCars.map(c => {
      const isLarge   = c.size === 'large';
      const isSmall   = c.size === 'small';
      const sizeLabel = c.sizeLabel || (isLarge ? 'گەورە' : isSmall ? 'بچووک' : (c.size || 'تر').replace('other:', ''));
      const sizeColor = isLarge ? 'bg-primary' : isSmall ? 'bg-success' : 'bg-secondary';
      return `
      <tr>
        <td>
          <span class="car-color-dot" style="background:${c.colorHex||'#eee'}; width:14px; height:14px; border-radius:50%; border:1px solid #dee2e6; display:inline-block; vertical-align:middle; margin-left:4px"></span>
          ${c.name}
        </td>
        <td><code>${c.plateNumber}</code></td>
        <td><span class="badge ${sizeColor}">${sizeLabel}</span></td>
        <td><small>${elapsedTime(c.entryTime)}</small></td>
        <td>
          <button class="btn btn-success btn-sm py-0 px-2" onclick="confirmExit('${c.id}'); showPage('activeCars')">
            <i class="bi bi-box-arrow-right"></i>
          </button>
        </td>
      </tr>
    `}).join('');
  }
}

// -------- History --------
// Populate category filter with custom cats
function populateHistorySizeFilter() {
  const sel = document.getElementById('filterSize');
  if (!sel) return;
  // Keep first 3 built-in options, remove old custom ones
  while (sel.options.length > 3) sel.remove(3);
  const custom = getAll(KEYS.categories);
  custom.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  });

  // Populate createdBy filter with unique users found in history
  const cbSel = document.getElementById('filterCreatedBy');
  if (cbSel) {
    const prev = cbSel.value;
    while (cbSel.options.length > 1) cbSel.remove(1);
    const done = getAll(KEYS.cars).filter(c => c.status === 'done');
    const names = [...new Set(done.map(c => c.createdBy).filter(Boolean))].sort();
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      cbSel.appendChild(opt);
    });
    if (names.includes(prev)) cbSel.value = prev;
  }
}

function updateHistoryStats(cars) {
  const cashIncome = cars.filter(c => c.customerType === 'cash').reduce((s, c) => s + (c.price || 0), 0);
  const monthlyCnt = cars.filter(c => c.customerType === 'monthly').length;
  // average duration in minutes
  const withDuration = cars.filter(c => c.entryTime && c.exitTime);
  let avgStr = '---';
  if (withDuration.length > 0) {
    const totalMs = withDuration.reduce((s, c) => s + (new Date(c.exitTime) - new Date(c.entryTime)), 0);
    const avgMins = Math.round(totalMs / withDuration.length / 60000);
    const h = Math.floor(avgMins / 60), m = avgMins % 60;
    avgStr = h > 0 ? `${h}کت ${m}خ` : `${m} خولەک`;
  }
  const el = id => document.getElementById(id);
  if (el('hist-stat-count'))   el('hist-stat-count').textContent   = cars.length;
  if (el('hist-stat-cash'))    el('hist-stat-cash').textContent    = formatNum(cashIncome) + ' د.ع';
  if (el('hist-stat-monthly')) el('hist-stat-monthly').textContent = monthlyCnt;
  if (el('hist-stat-avgtime')) el('hist-stat-avgtime').textContent = avgStr;
}

function renderHistory(filtered) {
  const sortDir = (document.getElementById('filterSort') || {}).value || 'newest';
  const allDone = filtered || getAll(KEYS.cars).filter(c => c.status === 'done');
  const tbody   = document.getElementById('historyTableBody');
  const customers = getAll(KEYS.customers);

  updateHistoryStats(allDone);

  if (allDone.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1"></i>مێژوو بەتاڵه</td></tr>';
    document.getElementById('historyTotal').textContent = '';
    document.getElementById('historyIncomeTotal').textContent = '';
    return;
  }

  const sorted = [...allDone].sort((a, b) =>
    sortDir === 'newest'
      ? new Date(b.entryTime) - new Date(a.entryTime)
      : new Date(a.entryTime) - new Date(b.entryTime)
  );

  // Group by date
  const groups = {};
  sorted.forEach(c => {
    const d = c.date || (c.entryTime ? c.entryTime.slice(0, 10) : '?');
    if (!groups[d]) groups[d] = [];
    groups[d].push(c);
  });

  let rowNum = 0;
  let html = '';
  const dates = Object.keys(groups).sort((a, b) =>
    sortDir === 'newest' ? b.localeCompare(a) : a.localeCompare(b)
  );

  dates.forEach(date => {
    const dayCars  = groups[date];
    const dayTotal = dayCars.reduce((s, c) => s + (c.price || 0), 0);
    const dayCount = dayCars.length;
    html += `<tr class="table-light fw-semibold">
      <td colspan="12" class="py-1 px-3 small">
        <i class="bi bi-calendar3 me-1 text-primary"></i>${date}
        <span class="ms-2 text-muted">${dayCount} شوشتن</span>
        <span class="ms-2 text-success">${formatNum(dayTotal)} د.ع</span>
      </td>
    </tr>`;

    dayCars.forEach(c => {
      rowNum++;
      const isLarge   = c.size === 'large';
      const isSmall   = c.size === 'small';
      const sizeLabel = c.sizeLabel || (isLarge ? 'گەورە' : isSmall ? 'بچووک' : (c.size || 'تر').replace('other:', ''));
      const sizeColor = isLarge ? 'primary' : isSmall ? 'success' : 'secondary';
      const custBadge = c.customerType === 'cash'
        ? '<span class="badge bg-warning text-dark">نقد</span>'
        : '<span class="badge bg-info text-dark">مانگانە</span>';
      const cust      = customers.find(cu => cu.id === c.customerId);
      const custName  = cust ? `<span class="text-info small">${cust.name}</span>` : '<span class="text-muted small">---</span>';
      const noteHtml  = c.note ? `<small class="text-muted" title="${c.note}">${c.note.length > 18 ? c.note.slice(0, 18) + '…' : c.note}</small>` : '<span class="text-muted">—</span>';
      const duration  = c.exitTime ? getElapsedBetween(c.entryTime, c.exitTime) : '<span class="text-muted">---</span>';

      html += `<tr style="cursor:pointer" onclick="openWashDetail('${c.id}')">
        <td class="text-center text-muted small">${rowNum}</td>
        <td>
          <span style="background:${c.colorHex||'#eee'}; width:10px; height:10px; border-radius:50%; border:1px solid #ccc; display:inline-block; vertical-align:middle; margin-left:3px"></span>
          <span class="fw-semibold">${c.name}</span>
          <br><small class="text-muted">${c.color}</small>
        </td>
        <td><code>${c.plateNumber}</code></td>
        <td><span class="badge bg-${sizeColor}">${sizeLabel}</span></td>
        <td>${custBadge}</td>
        <td>${custName}</td>
        <td><small>${formatDatetime(c.entryTime)}</small></td>
        <td><small>${duration}</small></td>
        <td class="fw-bold text-success">${c.customerType==='cash' ? formatNum(c.price)+' د.ع' : '<span class="text-muted small">مانگانە</span>'}</td>
        <td>${noteHtml}</td>
        <td><small class="text-muted">${c.createdBy ? '<i class="bi bi-person-fill me-1"></i>' + c.createdBy : '---'}</small></td>
        <td class="text-center" onclick="event.stopPropagation()">
          <div class="d-flex gap-1 justify-content-center">
            <button class="btn btn-outline-dark btn-sm p-0 px-1" onclick="showCarQR('${c.plateNumber.replace(/'/g,"&#39;")}','${c.name.replace(/'/g,"&#39;")}')" title="QR">
              <i class="bi bi-qr-code"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm p-0 px-1" onclick="deleteHistoryRecord('${c.id}')" title="سڕینەوە">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
    });
  });

  tbody.innerHTML = html;

  const grandTotal = sorted.filter(c => c.customerType === 'cash').reduce((s, c) => s + (c.price || 0), 0);
  document.getElementById('historyTotal').textContent = `${sorted.length} شوشتن تۆمار کراوە`;
  document.getElementById('historyIncomeTotal').textContent = `کۆی داهاتی نقد: ${formatNum(grandTotal)} د.ع`;
}

function getElapsedBetween(start, end) {
  if (!start || !end) return '---';
  const ms = new Date(end) - new Date(start);
  if (ms < 0) return '---';
  const mins = Math.floor(ms / 60000);
  const hrs  = Math.floor(mins / 60);
  const m    = mins % 60;
  if (hrs > 0) return `${hrs}کت ${m}خ`;
  return `${m} خولەک`;
}

function applyHistoryFilter() {
  let cars = getAll(KEYS.cars).filter(c => c.status === 'done');
  const from   = document.getElementById('filterFrom').value;
  const to     = document.getElementById('filterTo').value;
  const type   = document.getElementById('filterType').value;
  const size   = document.getElementById('filterSize')  ? document.getElementById('filterSize').value  : 'all';
  const createdBy = (document.getElementById('filterCreatedBy') || {}).value || 'all';
  const search = document.getElementById('historySearch').value.toLowerCase().trim();
  const customers = getAll(KEYS.customers);

  if (from)          cars = cars.filter(c => c.date >= from);
  if (to)            cars = cars.filter(c => c.date <= to);
  if (type !== 'all') cars = cars.filter(c => c.customerType === type);
  if (size !== 'all')      cars = cars.filter(c => c.size === size);
  if (createdBy !== 'all') cars = cars.filter(c => (c.createdBy || '') === createdBy);
  if (search) {
    cars = cars.filter(c => {
      const cust = customers.find(cu => cu.id === c.customerId);
      return (
        c.name.toLowerCase().includes(search) ||
        c.plateNumber.toLowerCase().includes(search) ||
        c.color.toLowerCase().includes(search) ||
        (c.note  || '').toLowerCase().includes(search) ||
        (c.sizeLabel || '').toLowerCase().includes(search) ||
        (c.createdBy || '').toLowerCase().includes(search) ||
        (cust ? cust.name.toLowerCase().includes(search) : false)
      );
    });
  }
  renderHistory(cars);
}

function openWashDetail(carId) {
  const car = getAll(KEYS.cars).find(c => c.id === carId);
  if (!car) return;
  const customers = getAll(KEYS.customers);
  const cust      = customers.find(c => c.id === car.customerId);
  const isLarge   = car.size === 'large';
  const isSmall   = car.size === 'small';
  const sizeLabel = car.sizeLabel || (isLarge ? 'گەورە' : isSmall ? 'بچووک' : (car.size || 'تر').replace('other:', ''));
  const sizeColor = isLarge ? 'primary' : isSmall ? 'success' : 'secondary';
  const duration  = car.exitTime ? getElapsedBetween(car.entryTime, car.exitTime) : '---';

  document.getElementById('washDetailBody').innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <span style="background:${car.colorHex||'#eee'}; width:28px; height:28px; border-radius:50%; border:2px solid #ccc; flex-shrink:0"></span>
      <div>
        <div class="fs-5 fw-bold">${car.name}</div>
        <div class="text-muted small">${car.color}</div>
      </div>
    </div>
    <table class="table table-sm table-bordered mb-0">
      <tr><th class="w-40 text-muted">پلاکە</th><td><code>${car.plateNumber}</code></td></tr>
      <tr><th class="text-muted">کەتەگۆری</th><td><span class="badge bg-${sizeColor}">${sizeLabel}</span></td></tr>
      <tr><th class="text-muted">جۆری کریار</th><td>${car.customerType === 'cash' ? '<span class="badge bg-warning text-dark">نقد</span>' : '<span class="badge bg-info text-dark">مانگانە</span>'}</td></tr>
      <tr><th class="text-muted">ناوی کریار</th><td>${cust ? cust.name : '---'}</td></tr>
      <tr><th class="text-muted">کاتی هاتن</th><td>${formatDatetime(car.entryTime)}</td></tr>
      <tr><th class="text-muted">کاتی چوون</th><td>${formatDatetime(car.exitTime)}</td></tr>
      <tr><th class="text-muted">ماوە</th><td>${duration}</td></tr>
      <tr><th class="text-muted">نرخ</th><td class="fw-bold text-success">${car.customerType === 'cash' ? formatNum(car.price) + ' د.ع' : 'مانگانە'}</td></tr>
      ${car.note ? `<tr><th class="text-muted">تێبینی</th><td>${car.note}</td></tr>` : ''}
      <tr><th class="text-muted">ناسنامە</th><td><small class="text-muted">${car.id}</small></td></tr>
    </table>
  `;
  document.getElementById('washDetailDeleteBtn').onclick = () => {
    if (confirm('دڵنیایت لە سڕینەوەی ئەم تۆمارە؟')) {
      deleteHistoryRecord(carId);
      bootstrap.Modal.getInstance(document.getElementById('washDetailModal')).hide();
    }
  };
  document.getElementById('washDetailQrBtn').onclick = () => showCarQR(car.plateNumber, car.name);
  new bootstrap.Modal(document.getElementById('washDetailModal')).show();
}

function deleteHistoryRecord(carId) {
  if (!confirm('دڵنیایت لە سڕینەوە؟')) return;
  let cars = getAll(KEYS.cars);
  cars = cars.filter(c => c.id !== carId);
  saveAll(KEYS.cars, cars);
  showToast('تۆمارەکە سڕایەوە', 'warning');
  applyHistoryFilter();
  renderDashboard();
}

function exportHistoryCSV() {
  const rows = getAll(KEYS.cars).filter(c => c.status === 'done');
  if (rows.length === 0) { showToast('مێژوو بەتاڵه', 'warning'); return; }
  const customers = getAll(KEYS.customers);
  const headers = ['#', 'ناو', 'پلاکە', 'رەنگ', 'کەتەگۆری', 'جۆری کریار', 'ناوی کریار', 'کاتی هاتن', 'کاتی چوون', 'ماوە', 'نرخ', 'تێبینی'];
  const sorted = [...rows].sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
  const lines = [headers.join(',')];
  sorted.forEach((c, i) => {
    const cust = customers.find(cu => cu.id === c.customerId);
    const isLarge = c.size === 'large', isSmall = c.size === 'small';
    const sizeLabel = c.sizeLabel || (isLarge ? 'گەورە' : isSmall ? 'بچووک' : (c.size || 'تر').replace('other:', ''));
    const duration = c.exitTime ? getElapsedBetween(c.entryTime, c.exitTime) : '';
    const row = [
      i + 1, c.name, c.plateNumber, c.color, sizeLabel,
      c.customerType === 'cash' ? 'نقد' : 'مانگانە',
      cust ? cust.name : '',
      c.entryTime || '', c.exitTime || '', duration,
      c.customerType === 'cash' ? (c.price || 0) : 'مانگانە',
      (c.note || '').replace(/,/g, ' ')
    ];
    lines.push(row.map(v => `"${v}"`).join(','));
  });
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wash-history-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('✔ فایلەکە دابەزرا', 'success');
}

function printHistory() {
  const table = document.getElementById('historyTable');
  if (!table) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>KING WASH - مێژووی شوشتن</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css">
    <style>body{padding:20px;font-family:Cairo,sans-serif}@media print{.no-print{display:none}}</style>
    </head><body>
    <h4 class="mb-3"><strong>KING WASH</strong> &mdash; مێژووی شوشتن</h4>
    ${table.outerHTML}
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// -------- Expenses --------
function submitExpense(e) {
  e.preventDefault();
  const catEl = document.querySelector('input[name="expCat"]:checked');
  if (!catEl) { showToast('تکایە کەتەگۆری هەڵبژێرە', 'danger'); return; }

  /** @type {any} */
  const exp = {
    id: genId(),
    description: document.getElementById('expDesc').value.trim(),
    category: catEl.value,
    amount: parseInt(document.getElementById('expAmount').value) || 0,
    date: document.getElementById('expDate').value,
    note: document.getElementById('expNote').value.trim(),
  };

  const expenses = getAll(KEYS.expenses);
  expenses.push(exp);
  saveAll(KEYS.expenses, expenses);

  closeModal('expenseModal');
  showToast('✔ خەرجیەکە تۆمار کرا', 'danger');
  e.target.reset();
  renderExpenses();
  renderDashboard();
}

function renderExpenses(filtered) {
  const expenses = filtered || getAll(KEYS.expenses);
  const tbody = document.getElementById('expensesTableBody');

  if (expenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">هیچ خەرجیەک تۆمار نەکراوە</td></tr>';
    document.getElementById('expensesTotal').textContent = '';
    return;
  }

  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const total = sorted.reduce((s, e) => s + (e.amount || 0), 0);

  tbody.innerHTML = sorted.map((ex, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${ex.description}<br><small class="text-muted">${ex.note || ''}</small></td>
      <td><span class="badge bg-secondary">${ex.category}</span></td>
      <td class="fw-bold text-danger">${formatNum(ex.amount)} د.ع</td>
      <td><small>${ex.date}</small></td>
      <td>
        <button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteExpense('${ex.id}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  document.getElementById('expensesTotal').textContent =
    'کۆی خەرجیەکان: ' + formatNum(total) + ' د.ع';
}

function deleteExpense(id) {
  if (!confirm('ئایا دڵنیایت لە سڕینەوەی ئەم خەرجییە؟')) return;
  let expenses = getAll(KEYS.expenses);
  expenses = expenses.filter(e => e.id !== id);
  saveAll(KEYS.expenses, expenses);
  showToast('خەرجیەکە سڕایەوە', 'warning');
  renderExpenses();
  renderDashboard();
}

function applyExpenseFilter() {
  let expenses = getAll(KEYS.expenses);
  const from = document.getElementById('expFilterFrom').value;
  const to   = document.getElementById('expFilterTo').value;
  const cat  = document.getElementById('expFilterCategory').value;

  if (from) expenses = expenses.filter(e => e.date >= from);
  if (to)   expenses = expenses.filter(e => e.date <= to);
  if (cat !== 'all') expenses = expenses.filter(e => e.category === cat);
  renderExpenses(expenses);
}

// -------- Customers --------
let currentCustomerFilter = 'all';

function buildCustCategoryPricesHtml(cust) {
  const cats = getCategories();
  const cp = cust.categoryPrices || {};
  if (Object.keys(cp).length > 0) {
    return cats.map(function(cat) {
      const p = cp[cat.id] !== undefined ? cp[cat.id] : cat.price;
      return '<div class="d-flex justify-content-between"><span class="text-muted">' + cat.name + ':</span><strong class="text-primary">' + formatNum(p) + ' د.ع</strong></div>';
    }).join('');
  }
  // no custom prices configured — show nothing
  return '';
}

function renderCustomerCategoryBtns() {
  // now replaced by renderCustomerCategoryPriceList
  renderCustomerCategoryPriceList();
}

function renderCustomerCategoryPriceList(editCust) {
  const container = document.getElementById('custCategoryPriceList');
  if (!container) return;
  const cats = getCategories();
  container.innerHTML = cats.map(cat => {
    const existing = editCust && editCust.categoryPrices ? (editCust.categoryPrices[cat.id] || '') : '';
    return `
    <div class="input-group input-group-sm mb-2">
      <span class="input-group-text" style="min-width:130px">
        <span class="badge bg-${cat.color||'secondary'} me-1">&nbsp;</span>${cat.name}
      </span>
      <input type="number" class="form-control" id="catprice-${cat.id}"
        placeholder="${cat.price} (دەفۆڵت)" min="0" value="${existing}" />
      <span class="input-group-text">د.ع</span>
      <button type="button" class="btn btn-outline-secondary" title="نرخی دەفۆڵت"
        onclick="document.getElementById('catprice-${cat.id}').value=''">بەخۆ</button>
    </div>`;
  }).join('');
}

function submitCustomer(e) {
  e.preventDefault();
  const typeEl = document.querySelector('input[name="custType"]:checked');
  if (!typeEl) { showToast('تکایە جۆری کریار هەڵبژێرە', 'danger'); return; }

  /** @type {any} */
  const cust = {
    id: genId(),
    name: document.getElementById('custName').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    type: typeEl.value,
    pricePerWash: null, // legacy field kept for backward compat
    categoryPrices: typeEl.value === 'monthly' ? (function() {
      const cats = getCategories();
      const map = {};
      cats.forEach(cat => {
        const el = document.getElementById('catprice-' + cat.id);
        const val = el ? (parseInt(el.value) || 0) : 0;
        if (val > 0) map[cat.id] = val;
      });
      return map;
    })() : null,
    note: document.getElementById('custNote').value.trim(),
    totalWashes: 0,
  };

  const customers = getAll(KEYS.customers);
  customers.push(cust);
  saveAll(KEYS.customers, customers);

  closeModal('addCustomerModal');
  showToast('✔ کریارەکە تۆمار کرا', 'success');
  e.target.reset();
  document.getElementById('monthlyContractDiv').style.display = 'none';
  renderCustomers();
}

function renderCustomers(filter) {
  filter = filter || currentCustomerFilter;
  currentCustomerFilter = filter;
  let customers = getAll(KEYS.customers);
  if (filter !== 'all') customers = customers.filter(c => c.type === filter);

  const grid = document.getElementById('customersGrid');

  if (customers.length === 0) {
    grid.innerHTML = `
      <div class="col-12 text-center text-muted py-5">
        <i class="bi bi-person-x" style="font-size:3rem"></i>
        <p class="mt-2">هیچ کریارێک نییە</p>
      </div>`;
    return;
  }

  // Count washes per customer
  const allCars = getAll(KEYS.cars);
  const washCount = {};
  allCars.forEach(c => { if (c.customerId) washCount[c.customerId] = (washCount[c.customerId] || 0) + 1; });

  grid.innerHTML = customers.map(cust => `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="customer-card ${cust.type}">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="fw-bold fs-6">${cust.name}</div>
            ${cust.phone ? `<div class="text-muted small"><i class="bi bi-telephone me-1"></i>${cust.phone}</div>` : ''}
          </div>
          <span class="badge ${cust.type === 'monthly' ? 'bg-info text-dark' : 'bg-warning text-dark'}">
            ${cust.type === 'monthly' ? '<i class="bi bi-calendar-check me-1"></i>مانگانە' : '<i class="bi bi-cash me-1"></i>نقد'}
          </span>
        </div>
        ${(function() {
          if (cust.type !== 'monthly') return '';
          const html = buildCustCategoryPricesHtml(cust);
          if (!html) return '';
          return '<hr class="my-2" /><div class="small">' + html + '</div>';
        })()}
        <hr class="my-2" />
        <div class="d-flex justify-content-between align-items-center">
          <div class="small text-muted"><i class="bi bi-car-front me-1"></i>کۆی شوشتن: <strong>${washCount[cust.id] || 0}</strong></div>
          <div class="d-flex gap-1">
            ${cust.type === 'monthly' ? `<button class="btn btn-outline-info btn-sm py-0 px-2" onclick="openInvoiceModal('${cust.id}', null)"><i class="bi bi-receipt"></i></button>` : ''}
            <button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteCustomer('${cust.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
        ${cust.note ? `<div class="small text-muted mt-1"><i class="bi bi-sticky me-1"></i>${cust.note}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function filterCustomers(type) {
  currentCustomerFilter = type;
  document.querySelectorAll('#tab-all, #tab-monthly, #tab-cash').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + type);
  if (tabEl) tabEl.classList.add('active');
  renderCustomers(type);
}

function deleteCustomer(id) {
  if (!confirm('ئایا دڵنیایت لە سڕینەوەی ئەم کریارە؟')) return;
  let customers = getAll(KEYS.customers);
  customers = customers.filter(c => c.id !== id);
  saveAll(KEYS.customers, customers);
  showToast('کریارەکە سڕایەوە', 'warning');
  renderCustomers();
}

// -------- Reports --------
function setReportRange(range) {
  const today = new Date();
  let from, to;
  to = todayStr();

  if (range === 'today') {
    from = todayStr();
  } else if (range === 'week') {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    from = d.toISOString().slice(0, 10);
  } else if (range === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  }

  document.getElementById('reportFrom').value = from;
  document.getElementById('reportTo').value   = to;
  generateReport();
}

function generateReport() {
  const from = document.getElementById('reportFrom').value;
  const to   = document.getElementById('reportTo').value;
  if (!from || !to) { showToast('بەروار هەڵبژێرە', 'warning'); return; }

  const cars     = getAll(KEYS.cars).filter(c => c.status === 'done' && c.date >= from && c.date <= to);
  const expenses = getAll(KEYS.expenses).filter(e => e.date >= from && e.date <= to);
  const payments = getAll(KEYS.payments).filter(p => p.date >= from && p.date <= to);

  // Monthly billing totals for this period
  const monthlyCars     = cars.filter(c => c.customerType === 'monthly');
  const monthlyCustomers = getAll(KEYS.customers).filter(c => c.type === 'monthly');
  // total due = use actual stored price on each car record
  let mDue = 0;
  monthlyCars.forEach(c => {
    mDue += (c.price || 0);
  });
  const mCollected    = payments.reduce((s, p) => s + (p.amount || 0), 0);
  // outstanding: total ever owed minus total ever collected (overall, not just this date range)
  // For the report window we show payments collected in range vs due in range
  const mOutstanding  = Math.max(0, mDue - mCollected);

  const income   = cars.filter(c => c.customerType === 'cash').reduce((s, c) => s + (c.price || 0), 0) + mCollected;
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const net      = income - totalExp;

  document.getElementById('rep-total-cars').textContent     = cars.length;
  document.getElementById('rep-total-income').textContent   = formatNum(income);
  document.getElementById('rep-total-expenses').textContent = formatNum(totalExp);
  document.getElementById('rep-net-profit').textContent     = formatNum(net);
  document.getElementById('rep-large-cars').textContent     = cars.filter(c => c.size === 'large').length;
  document.getElementById('rep-small-cars').textContent     = cars.filter(c => c.size === 'small').length;
  document.getElementById('rep-other-cars').textContent     = cars.filter(c => c.size !== 'large' && c.size !== 'small').length;
  document.getElementById('rep-cash-customers').textContent = cars.filter(c => c.customerType === 'cash').length;
  document.getElementById('rep-monthly-customers').textContent = monthlyCars.length;

  // Monthly billing section
  document.getElementById('rep-m-washes').textContent       = monthlyCars.length;
  document.getElementById('rep-m-total-due').textContent    = formatNum(mDue) + ' د.ع';
  document.getElementById('rep-m-collected').textContent    = formatNum(mCollected) + ' د.ع';
  document.getElementById('rep-m-outstanding').textContent  = formatNum(mOutstanding) + ' د.ع';

  document.getElementById('reportResults').style.display = 'block';
}

// -------- Customer type radio listener (Add Customer Modal) --------
document.addEventListener('change', function (e) {
  if (e.target.name === 'custType') {
    const div = document.getElementById('monthlyContractDiv');
    div.style.display = e.target.value === 'monthly' ? 'block' : 'none';
  }
});

// -------- Init Default Dates --------
(function initDates() {
  const today = todayStr();
  const els = ['filterFrom', 'filterTo', 'expFilterFrom', 'expFilterTo', 'expDate', 'reportFrom', 'reportTo'];
  els.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === 'filterFrom' || id === 'expFilterFrom' || id === 'reportFrom') {
        // 30 days ago
        const d = new Date();
        d.setDate(d.getDate() - 30);
        el.value = d.toISOString().slice(0, 10);
      } else {
        el.value = today;
      }
    }
  });
})();

// ======================================================
//  MONTHLY BILLING SYSTEM
// ======================================================

let _invoiceContext = { customerId: null, month: null };

// helpers
function currentMonthStr() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const d = new Date(+y, +mo - 1, 1);
  return d.toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' });
}

function getMonthWashes(customerId, month) {
  return getAll(KEYS.cars).filter(c =>
    c.customerId === customerId &&
    c.status === 'done' &&
    (c.date || '').startsWith(month)
  );
}

function getMonthPayments(customerId, month) {
  return getAll(KEYS.payments).filter(p =>
    p.customerId === customerId && p.month === month
  );
}

// ---- Billing Page ----
function setBillingMonthToday() {
  document.getElementById('billingMonth').value = currentMonthStr();
  renderMonthlyBilling();
}

function shiftBillingMonth(delta) {
  const el   = document.getElementById('billingMonth');
  const cur  = el.value || currentMonthStr();
  const [y, m] = cur.split('-').map(Number);
  const d    = new Date(y, m - 1 + delta, 1);
  el.value   = d.toISOString().slice(0, 7);
  renderMonthlyBilling();
}

function renderMonthlyBilling() {
  const el    = document.getElementById('billingMonth');
  if (!el.value) el.value = currentMonthStr();
  const month = el.value;

  const customers = getAll(KEYS.customers).filter(c => c.type === 'monthly');
  const grid = document.getElementById('billingCustomersGrid');

  if (customers.length === 0) {
    grid.innerHTML = `
      <div class="col-12 text-center text-muted py-5">
        <i class="bi bi-people" style="font-size:3rem"></i>
        <p class="mt-2">\u0647\u06cc\u0686 \u06a9\u0631\u06cc\u0627\u0631\u06cc \u0645\u0627\u0646\u06af\u0627\u0646\u06d5 \u0646\u06cc\u06cc\u06d5 \u2014 \u0644\u06d5 \u0628\u06d5\u0634\u06cc \u06a9\u0631\u06cc\u0627\u0631\u0627\u0646 \u0632\u06cc\u0627\u062f\u0628\u06a9\u06d5</p>
      </div>`;
    updateBillingSummary(0, 0, 0, 0);
    return;
  }

  let totalWashes = 0, totalDue = 0, totalPaid = 0;

  const cards = customers.map(cust => {
    const washes       = getMonthWashes(cust.id, month);
    const payments     = getMonthPayments(cust.id, month);
    const washCount    = washes.length;
    const due          = washes.reduce((s, w) => s + (w.price || 0), 0);
    const paid         = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const bal          = due - paid;

    totalWashes += washCount;
    totalDue    += due;
    totalPaid   += paid;

    const statusColor = bal <= 0
      ? 'success'
      : paid > 0 ? 'warning' : 'danger';
    const statusLabel = bal <= 0
      ? '\u062f\u0627\u0646\u0631\u0627\u0648\u0627 \u062a\u06d5\u0648\u0627\u0648\u062f\u06d5\u06a9\u0631\u0627\u06cc'
      : paid > 0
        ? `\u0642\u06d5\u0631\u0632: ${formatNum(bal)} \u062f.\u0639`
        : `\u0646\u06d5\u062f\u0631\u0627\u0648\u0627 \u062a\u06d5\u0648\u0627\u0648 - ${formatNum(bal)} \u062f.\u0639`;

    return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="billing-card" style="border-top: 4px solid var(--bs-${statusColor === 'danger' ? 'danger' : statusColor === 'warning' ? 'warning' : 'success'})">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <div class="fw-bold fs-6">${cust.name}</div>
              ${cust.phone ? `<div class="text-muted small"><i class="bi bi-telephone me-1"></i>${cust.phone}</div>` : ''}
            </div>
            <span class="badge bg-${statusColor === 'success' ? 'success' : statusColor === 'warning' ? 'warning text-dark' : 'danger'}">
              ${statusColor === 'success' ? '\u062f\u0627\u0646\u0631\u0627\u0648\u0627' : statusColor === 'warning' ? '\u0646\u06cc\u0645\u06d5\u0642\u06d5\u0631\u0632' : '\u0642\u06d5\u0631\u0632\u062f\u0627\u0631'}
            </span>
          </div>

          <div class="billing-stat-row">
            <div class="billing-stat">
              <div class="billing-stat-val text-primary">${washCount}</div>
              <div class="billing-stat-lbl">شوشتن</div>
            </div>
            <div class="billing-stat">
              <div class="billing-stat-val text-success">${formatNum(paid)}</div>
              <div class="billing-stat-lbl">دراوا</div>
            </div>
            <div class="billing-stat">
              <div class="billing-stat-val text-warning">${formatNum(due)}</div>
              <div class="billing-stat-lbl">کۆی دەدرەدان</div>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
            <div class="small">
              <span class="text-success fw-bold">\u062f\u0631\u0627\u0648\u0627: ${formatNum(paid)} \u062f.\u0639</span>
              ${bal > 0 ? `<span class="text-danger fw-bold me-2"> | \u0642\u06d5\u0631\u0632: ${formatNum(bal)} \u062f.\u0639</span>` : ''}
            </div>
          </div>

          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-outline-info btn-sm flex-grow-1" onclick="openInvoiceModal('${cust.id}', '${month}')">
              <i class="bi bi-receipt me-1"></i>\u0648\u06d5\u0633\u0644
            </button>
            ${bal > 0 ? `
            <button class="btn btn-success btn-sm flex-grow-1" onclick="openPaymentModal('${cust.id}', '${month}')">
              <i class="bi bi-cash-coin me-1"></i>\u067e\u0627\u0631\u06d5\u062f\u0627\u0646
            </button>` : `
            <button class="btn btn-outline-success btn-sm flex-grow-1" onclick="openPaymentModal('${cust.id}', '${month}')">
              <i class="bi bi-plus-circle me-1"></i>\u067e\u0627\u0631\u06d5\u06cc \u0632\u06cc\u0627\u062f\u06d5
            </button>`}
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = cards;
  updateBillingSummary(customers.length, totalWashes, totalDue, totalDue - totalPaid);
}

function updateBillingSummary(custs, washes, due, outstanding) {
  document.getElementById('bill-cust-count').textContent  = custs;
  document.getElementById('bill-wash-count').textContent  = washes;
  document.getElementById('bill-total-due').textContent   = formatNum(due);
  document.getElementById('bill-outstanding').textContent = formatNum(outstanding < 0 ? 0 : outstanding);
}

// ---- Invoice Modal ----
function openInvoiceModal(customerId, month) {
  if (!month) month = document.getElementById('billingMonth')?.value || currentMonthStr();
  _invoiceContext = { customerId, month };

  const cust = getAll(KEYS.customers).find(c => c.id === customerId);
  if (!cust) return;

  const washes       = getMonthWashes(customerId, month).sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
  const payments     = getMonthPayments(customerId, month).sort((a, b) => a.date.localeCompare(b.date));
  const washCount    = washes.length;
  const totalDue     = washes.reduce((s, w) => s + (w.price || 0), 0);
  const totalPaid    = payments.reduce((s, p) => s + p.amount, 0);
  const balance      = totalDue - totalPaid;

  document.getElementById('invoiceModalTitle').innerHTML =
    `<i class="bi bi-receipt me-2"></i>\u0648\u06d5\u0633\u0644 \u2014 ${cust.name} \u2014 ${monthLabel(month)}`;

  document.getElementById('invoiceModalBody').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-4 text-center">
        <div class="fs-3 fw-bold text-primary">${washCount}</div>
        <div class="small text-muted">\u0634\u0648\u0634\u062a\u0646</div>
      </div>
      <div class="col-4 text-center">
        <div class="fs-3 fw-bold text-warning">${formatNum(totalDue)}</div>
        <div class="small text-muted">\u06a9\u06c6\u06cc \u062f\u06d5\u062f\u0631\u06d5\u062f\u0627\u0646 (\u062f.\u0639)</div>
      </div>
      <div class="col-4 text-center">
        <div class="fs-3 fw-bold ${balance > 0 ? 'text-danger' : 'text-success'}">${formatNum(balance > 0 ? balance : 0)}</div>
        <div class="small text-muted">${balance > 0 ? '\u0642\u06d5\u0631\u0632' : '\u062f\u0627\u0646\u0631\u0627\u0648\u0627'} (\u062f.\u0639)</div>
      </div>
    </div>

    <!-- Wash list -->
    <div class="mb-3">
      <div class="fw-bold mb-2 small text-muted border-bottom pb-1">\u0644\u06cc\u0633\u062a\u06cc \u0634\u0648\u0634\u062a\u0646\u06d5\u06a9\u0627\u0646</div>
      ${washCount === 0
        ? '<p class="text-muted text-center">\u0647\u06cc\u0686 \u0634\u0648\u0634\u062a\u0646\u06ce\u06a9 \u0646\u06cc\u06cc\u06d5</p>'
        : `<div class="table-responsive"><table class="table table-sm table-hover mb-0">
            <thead class="table-light">
              <tr><th>#</th><th>\u0633\u06d5\u06cc\u0627\u0631\u06d5</th><th>\u06a9\u0627\u062a\u06cc \u0647\u0627\u062a\u0646</th><th>\u06a9\u0627\u062a\u06cc \u0686\u0648\u0648\u0646</th><th>\u0646\u0631\u062e</th></tr>
            </thead>
            <tbody>
              ${washes.map((w, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${w.name} <span class="car-color-dot" style="background:${w.colorHex||'#eee'};width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid #ccc;vertical-align:middle;margin-right:2px"></span></td>
                  <td><small>${formatDatetime(w.entryTime)}</small></td>
                  <td><small>${formatDatetime(w.exitTime)}</small></td>
                  <td class="text-success fw-bold">${formatNum(w.price || 0)}</td>
                </tr>`).join('')}
              <tr class="table-warning fw-bold">
                <td colspan="4" class="text-end">\u06a9\u06c6\u06cc</td>
                <td>${formatNum(totalDue)} \u062f.\u0639</td>
              </tr>
            </tbody>
          </table></div>`
      }
    </div>

    <!-- Payment history -->
    <div>
      <div class="fw-bold mb-2 small text-muted border-bottom pb-1">\u0645\u06ce\u0698\u0648\u0648\u06cc \u067e\u0627\u0631\u06d5\u062f\u0627\u0646</div>
      ${payments.length === 0
        ? '<p class="text-muted small text-center">\u0647\u06cc\u0686 \u067e\u0627\u0631\u06d5\u06cc\u06d5\u06a9 \u062f\u0631\u0627\u0648\u0627 \u0646\u06cc\u06cc\u06d5</p>'
        : payments.map(p => `
          <div class="d-flex justify-content-between align-items-center border rounded px-3 py-2 mb-2 bg-light">
            <div>
              <div class="fw-bold text-success">${formatNum(p.amount)} \u062f.\u0639</div>
              ${p.note ? `<div class="small text-muted">${p.note}</div>` : ''}
            </div>
            <div class="text-end">
              <div class="small text-muted">${p.date}</div>
              <button class="btn btn-outline-danger btn-sm py-0 px-1 mt-1" onclick="deletePayment('${p.id}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>`).join('')
      }
      ${payments.length > 0 ? `
        <div class="d-flex justify-content-between fw-bold mt-1 px-1">
          <span>\u06a9\u06c6\u06cc \u062f\u0631\u0627\u0648\u0627:</span>
          <span class="text-success">${formatNum(totalPaid)} \u062f.\u0639</span>
        </div>
        <div class="d-flex justify-content-between fw-bold px-1 ${balance > 0 ? 'text-danger' : 'text-success'}">
          <span>${balance > 0 ? '\u0642\u06d5\u0631\u0632\u06cc \u0645\u0627\u0648\u06d5:' : '\u0628\u0627\u0644\u0627\u0646\u0633:'}</span>
          <span>${formatNum(Math.abs(balance))} \u062f.\u0639</span>
        </div>` : ''}
    </div>
  `;

  // show/hide pay button
  document.getElementById('invoicePayBtn').style.display = balance <= 0 ? 'none' : '';
  openModal('invoiceModal');
}

function openPayFromInvoice() {
  closeModal('invoiceModal');
  setTimeout(() => {
    openPaymentModal(_invoiceContext.customerId, _invoiceContext.month);
  }, 350);
}

// ---- Payment Modal ----
function openPaymentModal(customerId, month) {
  if (!month) month = document.getElementById('billingMonth')?.value || currentMonthStr();

  const cust = getAll(KEYS.customers).find(c => c.id === customerId);
  if (!cust) return;

  const washes       = getMonthWashes(customerId, month);
  const payments     = getMonthPayments(customerId, month);
  const totalDue     = washes.reduce((s, w) => s + (w.price || 0), 0);
  const totalPaid    = payments.reduce((s, p) => s + p.amount, 0);
  const balance      = totalDue - totalPaid;

  document.getElementById('payCustomerId').value = customerId;
  document.getElementById('payMonth').value      = month;
  document.getElementById('payAmount').value     = balance > 0 ? balance : '';
  document.getElementById('payDate').value       = todayStr();
  document.getElementById('payNote').value       = '';

  document.getElementById('paymentSummaryCard').innerHTML = `
    <div class="fw-bold mb-1">${cust.name} <span class="text-muted small">— ${monthLabel(month)}</span></div>
    <div class="row text-center g-2 mt-1">
      <div class="col-4">
        <div class="text-muted small">\u0634\u0648\u0634\u062a\u0646</div>
        <div class="fw-bold text-primary">${washes.length}</div>
      </div>
      <div class="col-4">
        <div class="text-muted small">\u062f\u06d5\u062f\u0631\u06d5\u062f\u0627\u0646</div>
        <div class="fw-bold text-warning">${formatNum(totalDue)} \u062f.\u0639</div>
      </div>
      <div class="col-4">
        <div class="text-muted small">\u0642\u06d5\u0631\u0632</div>
        <div class="fw-bold text-danger">${formatNum(balance > 0 ? balance : 0)} \u062f.\u0639</div>
      </div>
    </div>
  `;

  // Quick fill buttons
  const btns = document.getElementById('payQuickBtns');
  btns.innerHTML = '';
  if (balance > 0) {
    [['\u062a\u06d5\u0648\u0627\u0648\u06cc \u0642\u06d5\u0631\u0632', balance], ['\u0646\u06cc\u0648\u06d5\u06a9\u06d5\u0645', Math.round(balance / 2)]]
      .filter(([, v]) => v > 0)
      .forEach(([label, val]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-outline-secondary btn-sm';
        b.textContent = `${label} (${formatNum(val)})`;
        b.onclick = () => document.getElementById('payAmount').value = val;
        btns.appendChild(b);
      });
  }

  openModal('paymentModal');
}

function submitPayment(e) {
  e.preventDefault();
  const customerId = document.getElementById('payCustomerId').value;
  const month      = document.getElementById('payMonth').value;
  const amount     = parseInt(document.getElementById('payAmount').value) || 0;
  const date       = document.getElementById('payDate').value;
  const note       = document.getElementById('payNote').value.trim();

  if (amount <= 0) { showToast('\u0628\u0695\u06cc \u067e\u0627\u0631\u06d5\u06a9\u06d5 \u0628\u0646\u0648\u0648\u0633\u06d5', 'danger'); return; }

  const payments = getAll(KEYS.payments);
  payments.push({ id: genId(), customerId, month, amount, date, note });
  saveAll(KEYS.payments, payments);

  closeModal('paymentModal');
  showToast('\u2714 \u067e\u0627\u0631\u06d5\u062f\u0627\u0646\u06d5\u06a9\u06d5 \u062a\u06c6\u0645\u0627\u0631 \u06a9\u0631\u0627', 'success');
  renderMonthlyBilling();
  renderDashboard();
}

function deletePayment(id) {
  if (!confirm('\u0626\u0627\u06cc\u0627 \u062f\u06b5\u0646\u06cc\u0627\u06cc\u062a \u0644\u06d5 \u0633\u0695\u06cc\u0646\u06d5\u0648\u06d5\u06cc \u0626\u06d5\u0645 \u067e\u0627\u0631\u06d5\u062f\u0627\u0646\u06d5\u061f')) return;
  let payments = getAll(KEYS.payments);
  payments = payments.filter(p => p.id !== id);
  saveAll(KEYS.payments, payments);
  showToast('\u067e\u0627\u0631\u06d5\u062f\u0627\u0646\u06d5\u06a9\u06d5 \u0633\u0695\u0627\u06cc\u06d5\u0648\u06d5', 'warning');
  // refresh invoice
  if (_invoiceContext.customerId) {
    openInvoiceModal(_invoiceContext.customerId, _invoiceContext.month);
  }
  renderMonthlyBilling();
  renderDashboard();
}

// -------- Reset System --------
function resetToggleAll(masterChk) {
  document.querySelectorAll('.reset-chk').forEach(c => c.checked = masterChk.checked);
  updateResetCounts();
}

function updateResetCounts() {
  const counts = {
    'rst-cars':       getAll(KEYS.cars).length,
    'rst-customers':  getAll(KEYS.customers).length,
    'rst-expenses':   getAll(KEYS.expenses).length,
    'rst-payments':   getAll(KEYS.payments).length,
    'rst-categories': getAll(KEYS.categories).length,
    'rst-users':      getUsers().filter(u => !u.isDefaultAdmin).length,
  };
  Object.entries(counts).forEach(([id, cnt]) => {
    const chkEl = document.getElementById(id);
    if (!chkEl) return;
    const badge = chkEl.closest('label')?.querySelector('.rst-count');
    if (badge) badge.textContent = cnt + ' تۆمار';
  });
}

// -------- More Menu (mobile) --------
function toggleMoreMenu() {
  const menu     = document.getElementById('moreMenu');
  const backdrop = document.getElementById('moreMenuBackdrop');
  const btn      = document.getElementById('btn-more');
  if (!menu) return;
  const isOpen = !menu.classList.contains('menu-hidden');
  if (isOpen) {
    menu.classList.add('menu-hidden');
    backdrop.classList.add('menu-hidden');
    if (btn) btn.classList.remove('active');
  } else {
    menu.classList.remove('menu-hidden');
    backdrop.classList.remove('menu-hidden');
    if (btn) btn.classList.add('active');
  }
}

function closeMoreMenu() {
  const menu     = document.getElementById('moreMenu');
  const backdrop = document.getElementById('moreMenuBackdrop');
  const btn      = document.getElementById('btn-more');
  if (menu)     menu.classList.add('menu-hidden');
  if (backdrop) backdrop.classList.add('menu-hidden');
  if (btn)      btn.classList.remove('active');
}

// -------- Backup / Restore --------
function exportData() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cars:       getAll(KEYS.cars),
    customers:  getAll(KEYS.customers),
    expenses:   getAll(KEYS.expenses),
    categories: getAll(KEYS.categories),
    payments:   getAll(KEYS.payments),
    users:      getAll(KEYS.users),
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `kingwash-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✔ بەکئەپ داونلۆد کرا', 'success');
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version || !data.cars) {
        showToast('فایلەکە دروست نییە یان کۆنە', 'danger');
        return;
      }
      if (!confirm('ئایا دڵنیایت؟ داتای ئێستا جێگادەگیرێت!')) { input.value = ''; return; }
      if (data.cars)       saveAll(KEYS.cars,       data.cars);
      if (data.customers)  saveAll(KEYS.customers,  data.customers);
      if (data.expenses)   saveAll(KEYS.expenses,   data.expenses);
      if (data.categories) saveAll(KEYS.categories, data.categories);
      if (data.payments)   saveAll(KEYS.payments,   data.payments);
      if (data.users)      saveAll(KEYS.users,      data.users);
      input.value = '';
      closeModal('backupModal');
      showToast('✔ داتاکان گەڕاندرانەوە — پەڕەکە نوێدەکرێتەوە', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch(err) {
      showToast('هەڵە: فایلەکە خراپە یان JSON نییە', 'danger');
    }
  };
  reader.readAsText(file);
}

function executeReset() {
  const confirmText = (document.getElementById('resetConfirmText').value || '').trim();
  if (confirmText !== 'RESET') {
    showToast('تکایە RESET بنووسە بۆ دەستپێکردن', 'danger');
    document.getElementById('resetConfirmText').focus();
    return;
  }

  const checked = {
    cars:       document.getElementById('rst-cars')?.checked,
    customers:  document.getElementById('rst-customers')?.checked,
    expenses:   document.getElementById('rst-expenses')?.checked,
    payments:   document.getElementById('rst-payments')?.checked,
    categories: document.getElementById('rst-categories')?.checked,
    users:      document.getElementById('rst-users')?.checked,
  };

  if (!Object.values(checked).some(Boolean)) {
    showToast('تکایە لانی کەم یەک بەش هەڵبژێرە', 'warning');
    return;
  }

  const labels = [];
  if (checked.cars)       { saveAll(KEYS.cars, []);       labels.push('مێژووی شوشتن'); }
  if (checked.customers)  { saveAll(KEYS.customers, []);  labels.push('کریاران'); }
  if (checked.expenses)   { saveAll(KEYS.expenses, []);   labels.push('خەرجیەکان'); }
  if (checked.payments)   { saveAll(KEYS.payments, []);   labels.push('پارەدانەکان'); }
  if (checked.categories) { saveAll(KEYS.categories, []); labels.push('کەتەگۆریەکان'); }
  if (checked.users) {
    // keep default admin, remove all others
    const kept = getUsers().filter(u => u.isDefaultAdmin);
    saveAll(KEYS.users, kept);
    labels.push('بەکارهێنەران');
  }

  closeModal('resetModal');
  showToast('✔ ریسیتکرا: ' + labels.join('، '), 'success');

  // Refresh current visible page
  renderDashboard();
  applyHistoryFilter();
  renderCustomers();
  renderExpenses();
  renderMonthlyBilling();
}

// -------- Category Modal: refresh list on open --------
document.addEventListener('DOMContentLoaded', function () {
  const catModal = document.getElementById('addCategoryModal');
  if (catModal) {
    catModal.addEventListener('show.bs.modal', function () {
      renderCategoriesList();
    });
  }

  // Customer modal: populate category buttons + clear fields on open
  const custModal = document.getElementById('addCustomerModal');
  if (custModal) {
    custModal.addEventListener('show.bs.modal', function () {
      renderCustomerCategoryBtns();
    });
  }

  // Add user modal: clear fields on open
  const addUserModal = document.getElementById('addUserModal');
  if (addUserModal) {
    addUserModal.addEventListener('show.bs.modal', function () {
      document.getElementById('newUserName').value = '';
      document.getElementById('newUserPass').value = '';
      const checked = document.querySelector('input[name="newUserRole"]:checked');
      if (checked) checked.checked = false;
    });
  }

  // Reset modal: clear confirm text & checkboxes on open
  const resetModal = document.getElementById('resetModal');
  if (resetModal) {
    resetModal.addEventListener('show.bs.modal', function () {
      document.getElementById('resetConfirmText').value = '';
      document.querySelectorAll('.reset-chk, #rst-all').forEach(c => c.checked = false);
      updateResetCounts();
    });
    // Live counts on checkbox change
    resetModal.addEventListener('change', function (e) {
      if (e.target.classList.contains('reset-chk') || e.target.id === 'rst-all') {
        updateResetCounts();
      }
    });
  }
});

// -------- Start App --------
(function initApp() {
  // Start Firebase sync in background (non-blocking)
  initFirebaseSync().then(() => {
    // After pulling latest data, re-render active page if already logged in
    const u = getCurrentUser();
    if (u) _refreshCurrentPage();
  });

  const user = getCurrentUser();
  if (!user) {
    // show login screen
    document.getElementById('loginScreen').style.display = '';
  } else {
    document.getElementById('loginScreen').style.display = 'none';
    applyRoleUI();
    showPage(user.role === 'admin' ? 'dashboard' : 'newCar');
  }
})();
