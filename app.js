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

function _setSyncStatus(status) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  const map = {
    off:         { bg: '#6c757d', title: 'ئۆفلاین',          pulse: false },
    connecting:  { bg: '#ffc107', title: 'تەواوبوون...',     pulse: true  },
    online:      { bg: '#28a745', title: 'Firebase وەصڵە ✓', pulse: false },
    error:       { bg: '#dc3545', title: 'Firebase هەڵە',    pulse: false },
  };
  const s = map[status] || map.off;
  dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${s.bg};`+
    `display:inline-block;transition:background .4s;vertical-align:middle;`+
    (s.pulse ? 'animation:kw-pulse 1s infinite;' : '');
  dot.title = s.title;
}

async function initFirebaseSync() {
  if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG ||
      window.FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') { _setSyncStatus('off'); return; }
  _setSyncStatus('connecting');
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    _db = firebase.firestore();

    // Sync strategy:
    // - If Firestore has data → use Firestore (pull)
    // - If Firestore empty but localStorage has data → push localStorage to Firestore
    for (const key of _SYNC_KEYS) {
      const snap = await _db.collection(_FB_COL).doc(key).get();
      if (snap.exists) {
        // Firestore wins — pull to localStorage
        const items = snap.data().items || [];
        localStorage.setItem(key, JSON.stringify(items));
      } else {
        // Firestore empty — push existing localStorage data up
        const local = JSON.parse(localStorage.getItem(key) || '[]');
        if (local.length > 0) {
          await _db.collection(_FB_COL).doc(key)
            .set({ items: local, updatedAt: new Date().toISOString() });
        }
      }
    }

    // Real-time listeners: auto-refresh when another device saves
    _SYNC_KEYS.forEach(key => {
      _db.collection(_FB_COL).doc(key).onSnapshot(snap => {
        if (!snap.exists) return;
        const items = snap.data().items || [];
        const newStr = JSON.stringify(items);
        if (newStr !== localStorage.getItem(key)) {
          localStorage.setItem(key, newStr);
          _refreshCurrentPage();
          showToast('داتاکان نوێ کرایەوە ☁', 'info');
        }
      });
    });

    _setSyncStatus('online');
    console.log('[KING WASH] Firebase sync چالاک بوو');
  } catch (err) {
    _setSyncStatus('error');
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
  const cashier    = user ? user.username : 'کینگ واش';
  const now        = new Date();
  const dateStr    = now.toLocaleDateString('ar-IQ') + ' ' + now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  const txId       = '00' + car.id.replace(/-/g, '').slice(0, 12).toUpperCase();
  const payMode    = car.customerType === 'cash' ? 'نقد' : 'مانگانە';
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
<title>وەسڵ - ${car.plateNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;width:58mm;margin:0 auto;font-size:10px;color:#000;background:#fff}
  .c{text-align:center}
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
  <img src="data:image/png;base64,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" style="width:140px;height:140px;display:block;margin:0 auto 4px;border-radius:14px;object-fit:cover;" />
</div>

<hr/>

<div style="padding:0 1px">
  <div class="row"><span>کینگ واش</span><span></span></div>
  <div class="row"><span>بەروار:</span><span>${dateStr}</span></div>
  <div class="row"><span>ژ. مامەڵە:</span><span>${txId}</span></div>
  <div class="row"><span>ناسنامەی تەرمینال:</span><span>044449</span></div>
  <div class="row"><span>ناوی کارمەند:</span><span>${cashier}</span></div>
  <div class="row"><span>شێوازی پارەدان:</span><span>${payMode}</span></div>
  <div class="row"><span>ژمارەی سەیارە:</span><span>${car.plateNumber}</span></div>
  <div class="row"><span>رەنگی سەیارە:</span><span>${car.color}</span></div>
</div>

<hr/>

<div class="inv-title">وەسڵ</div>

<table style="margin:3px 0">
  <tr><td></td><td style="text-align:right;font-weight:bold">PDR1</td></tr>
  <tr><td>ناو</td><td style="text-align:right">${car.name}</td></tr>
  <tr><td>نرخی شوشتن</td><td style="text-align:right">${priceStr} د.ع</td></tr>
  <tr><td>ژمارە</td><td style="text-align:right">1</td></tr>
  <tr><td>کۆی گشتی</td><td style="text-align:right">${priceStr} د.ع</td></tr>
  <tr><td colspan="2"><hr/></td></tr>
  <tr><td>داشکاندن</td><td style="text-align:right">0.0 د.ع</td></tr>
  <tr class="total"><td><strong>کۆی گشتی</strong></td><td style="text-align:right"><strong>${priceStr} د.ع</strong></td></tr>
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
  <div class="thanks">سوپاس بۆ سەردانەکەتان</div>
</div>

<script>window.onload=function(){var imgs=document.images;var loaded=0;if(imgs.length===0){setTimeout(function(){window.print();},300);return;}for(var i=0;i<imgs.length;i++){imgs[i].onload=imgs[i].onerror=function(){loaded++;if(loaded===imgs.length){setTimeout(function(){window.print();},300);}};if(imgs[i].complete){loaded++;if(loaded===imgs.length){setTimeout(function(){window.print();},300);}}}};window.onafterprint=function(){window.close()}<\/script>
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
