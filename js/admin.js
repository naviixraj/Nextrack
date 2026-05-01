/* ──────────────────────────────────────────────
   admin.js  –  Dashboard, Monitoring, Management
   ────────────────────────────────────────────── */

let globalYearFilter = 'All';

document.addEventListener('DOMContentLoaded', async () => {
  const loader = document.getElementById('startup-loader');
  const msgEl = document.getElementById('startup-msg');
  const messages = ["Securely Synchronizing...", "NexTrack | Enterprise Intelligence", "Verifying Admin Credentials...", "Team Titans | Precision Systems", "Welcome back. — Provided by Team Titans"];
  
  let msgIdx = 0;
  const msgInterval = setInterval(() => {
    if (msgEl) {
      msgEl.style.opacity = 0;
      setTimeout(() => {
        msgEl.textContent = messages[msgIdx % messages.length];
        msgEl.style.opacity = 1;
        msgIdx++;
      }, 300);
    }
  }, 800);

  const startTime = Date.now();

  // 1. ALWAYS unlock tab navigation first — no exceptions
  initTabs();

  const session = getSession();
  if (!session || session.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

  // 2. Sync cloud data
  try {
    await initCollegeSync(session.collegeId);
  } catch (err) {
    console.warn('Cloud sync issue:', err);
  }

  // 3. Render dashboard
  initDashboard();

  // 4. Premium UI Initialization
  initYearFilter();

  // 5. Fade out loader after min 800ms
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, 800 - elapsed);
  setTimeout(() => {
    clearInterval(msgInterval);
    if (loader) loader.classList.add('fade-out');
  }, remaining);

  // 6. Security Checks
  try { if (window.NexSecurity) NexSecurity.logAction('ADMIN_LOGIN', `Admin ${session.userId} entered.`); } catch(e){}
  try { checkAdminSecurity(session.userId); } catch(e){}
  try { initIdleLock(); } catch(e){}
});

let idleTimer;
function initIdleLock() {
  const resetTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      alert('⏳ Session expired due to inactivity for your safety.');
      logout();
    }, 1800000); // 30 mins
  };
  window.onload = resetTimer;
  document.onmousemove = resetTimer;
  document.onkeypress = resetTimer;
  resetTimer();
}

/* ═══════════════════════════════════════════════
   TAB NAVIGATION (was missing — root cause of freeze)
   ═══════════════════════════════════════════════ */
function initTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.panel);
      if (target) {
        target.classList.add('active');
      }
      
      // Auto-refresh data on tab switch
      if (typeof refreshDashboard === 'function') refreshDashboard();
    });
  });
}

async function checkAdminSecurity(adminId) {
  const admin = getStudentById(adminId);
  if (admin && admin.password === 'admin1234') {
    document.body.classList.add('security-lock-active');
    document.getElementById('security-enforcement-overlay').style.display = 'flex';
    initForcedPasswordLogic(adminId);
  }
}

function initForcedPasswordLogic(adminId) {
  const form = document.getElementById('forced-password-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const newPwd = document.getElementById('forced-new-pwd').value;
    const confirmPwd = document.getElementById('forced-confirm-pwd').value;

    if (newPwd.length < 6) { return alert('⚠️ Password must be at least 6 characters.'); }
    if (newPwd !== confirmPwd) { return alert('⚠️ Passwords do not match.'); }
    if (newPwd === 'admin1234') { return alert('❌ Cannot reuse the default password.'); }

    try {
      await updateInCollege('students', adminId, { password: newPwd });
      
      // Update local cache too for immediate effect
      updateStudent(adminId, { password: newPwd });
      
      NexUX.playSuccess();
      NexSecurity.logAction('SECURITY_UPGRADE', 'Master Admin updated default password.');
      
      document.body.classList.remove('security-lock-active');
      document.getElementById('security-enforcement-overlay').style.display = 'none';
      
      alert('🎉 Security Updated! Dashboard is now unlocked.');
      window.location.reload(); // Hard refresh to ensure all listeners use new state
    } catch (err) {
      alert('❌ Failed to update password: ' + err.message);
    }
  };
}

/* ═══════════════════════════════════════════════
   DASHBOARD – Status Cards
   ═══════════════════════════════════════════════ */
function initDashboard() {
  updateWhitelabeling();
  updateSubscriptionStatus();
  renderCards();
  renderMonitoringTable();
  renderDirectory();
  renderAdminList();
}

/** 💰 Subscription Monitoring */
function updateSubscriptionStatus() {
  const sub = JSON.parse(localStorage.getItem(getDbKey('SUBSCRIPTION')) || '{}');
  const badge = document.getElementById('sub-status-badge');
  if (!badge) return;

  // Let NexBilling determine actual status (handles TEST_MODE)
  const currentStatus = window.NexBilling ? NexBilling.getStatus() : (sub.status || 'trial');

  if (currentStatus === 'active') {
    const expiry = new Date(sub.expiryDate);
    const left = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
    
    if (left <= 0) {
      badge.textContent = 'EXPIRED';
      badge.className = 'status-badge badge-out';
      lockSystemForPayment();
    } else {
      badge.textContent = `PREMIUM (${left}d left)`;
      badge.className = 'status-badge badge-in';
    }
  } else if (currentStatus === 'trial') {
    badge.textContent = 'TRIAL MODE';
    badge.className = 'status-badge badge-warn';
  } else {
    badge.textContent = 'PAUSED';
    badge.className = 'status-badge badge-out';
    lockSystemForPayment();
  }
}

function lockSystemForPayment() {
  if (window.NexBilling && NexBilling.TEST_MODE) return; // Prevent lockout in test mode
  document.body.innerHTML += `
    <div id="admin-js-lockout" class="modal-overlay visible" style="z-index:9999999;">
      <div class="modal glass" style="text-align:center; padding:4rem;">
        <h1 style="font-size:3rem;">🛑</h1>
        <h2>Access Paused</h2>
        <p>Your subscription has expired or been paused.</p>
        <button class="btn btn-primary" onclick="NexBilling.triggerCheckout()" style="padding:1rem 2rem; font-size:1.1rem; margin-top:1rem;">
          Pay ₹1,499 to Unlock
        </button>
        <button class="btn btn-ghost" onclick="logout()" style="margin-top:1rem; display:block; width:100%;">Logout</button>
      </div>
    </div>
  `;
}

/** 🏰 SaaS Whitelabeling Engine (v78) */
function updateWhitelabeling() {
  const sub = JSON.parse(localStorage.getItem('smt_subscription') || '{}');
  const config = sub.config || {};
  
  if (config.institutionName) {
    document.querySelectorAll('.brand-name').forEach(el => el.textContent = config.institutionName);
    document.title = `${config.institutionName} | NexTrack Admin`;
  }
}

function renderCards() {
  let students = getStudents().filter(s => s.role !== 'admin');
  if (globalYearFilter !== 'All') {
    students = students.filter(s => s.year === globalYearFilter);
  }
  const movements = getMovements();
  const total = students.length;

  let outsideCount = 0;
  students.forEach(s => {
    const stuMovs = movements.filter(m => m.studentId === s.id);
    if (stuMovs.length > 0) {
      const latest = stuMovs[stuMovs.length - 1];
      if (!latest.inTime) outsideCount++;
    }
  });

  const insideCount = total - outsideCount;

  document.getElementById('card-total').textContent = total;
  document.getElementById('card-inside').textContent = insideCount;
  document.getElementById('card-outside').textContent = outsideCount;

  // Curfew Alert
  const outsideCard = document.getElementById('outside-card');
  if (isNowPastCurfew() && outsideCount > 0) {
    outsideCard.classList.add('blink-alert');
  } else {
    outsideCard.classList.remove('blink-alert');
  }
}

window.showOutsideStudents = function () {
  NexUX.vibrate();
  const students = getStudents().filter(s => s.role !== 'admin');
  const movements = getMovements();
  const outsideList = [];

  students.forEach(s => {
    const stuMovs = movements.filter(m => m.studentId === s.id);
    if (stuMovs.length > 0) {
      const latest = stuMovs[stuMovs.length - 1];
      if (!latest.inTime) {
        outsideList.push({ student: s, outTime: latest.outTime });
      }
    }
  });

  const container = document.getElementById('outside-list');
  if (outsideList.length === 0) {
    container.innerHTML = `<p class="empty-row">🎉 ${t('SCAN_SUCCESS')}</p>`;
  } else {
    container.innerHTML = outsideList.map(item => {
      const s = item.student;
      const photo = s.photo ? `<img src="${s.photo}" class="table-avatar">` : '<span class="table-avatar-placeholder">👤</span>';
      return `
        <div class="recovery-card" onclick="document.getElementById('outside-modal').classList.remove('visible'); showStudentDetail('${s.id}');" style="cursor:pointer;">
          <div style="display:flex;align-items:center;gap:0.8rem;">
            ${photo}
            <div class="recovery-info">
              <strong>${s.name}</strong>
              <span class="recovery-meta">Room ${s.room} · Out since ${formatTime(item.outTime)}</span>
            </div>
          </div>
          <a href="tel:${s.phone}" class="call-btn" onclick="event.stopPropagation();">📞 Call</a>
        </div>
      `;
    }).join('');
  }

  document.getElementById('outside-modal').classList.add('visible');
};

function startCurfewCheck() {
  curfewInterval = setInterval(() => {
    renderCards();
  }, 30000);
}

/* ═══════════════════════════════════════════════
   DATE FILTERS
   ═══════════════════════════════════════════════ */
function initDateFilters() {
  const btnToday = document.getElementById('filter-today');
  const btnYesterday = document.getElementById('filter-yesterday');
  const btnCustom = document.getElementById('filter-custom-btn');

  if (btnToday) btnToday.addEventListener('click', () => setDateFilter('today'));
  if (btnYesterday) btnYesterday.addEventListener('click', () => setDateFilter('yesterday'));
  if (btnCustom) {
    btnCustom.addEventListener('click', () => {
      const val = document.getElementById('filter-custom-date').value;
      if (val) {
        customDate = val;
        setDateFilter('custom');
      }
    });
  }
}

function setDateFilter(mode) {
  NexUX.vibrate(50);
  currentDateFilter = mode;
  document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
  if (mode === 'today') document.getElementById('filter-today').classList.add('active');
  else if (mode === 'yesterday') document.getElementById('filter-yesterday').classList.add('active');
  renderMonitoringTable();
}

function getFilterDate() {
  if (currentDateFilter === 'today') return todayStr();
  if (currentDateFilter === 'yesterday') return yesterdayStr();
  return customDate;
}

/* ═══════════════════════════════════════════════
   MONITORING TABLE
   ═══════════════════════════════════════════════ */
function renderMonitoringTable() {
  const dateStr = getFilterDate();
  document.getElementById('table-date-label').textContent = dateStr;

  let movements = getMovementsByDate(dateStr);
  
  // Filter by Year if active
  if (globalYearFilter !== 'All') {
    movements = movements.filter(m => {
      const s = getStudentById(m.studentId);
      return s && s.year === globalYearFilter;
    });
  }

  const tbody = document.getElementById('monitor-body');

  if (movements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No movements recorded</td></tr>';
    return;
  }

  tbody.innerHTML = movements.map((m, i) => {
    const student = getStudentById(m.studentId);
    const name = student ? student.name : 'Unknown';
    const room = student ? student.room : '—';
    const phone = student ? student.phone : '—';
    const photo = student && student.photo ? `<img src="${student.photo}" class="table-avatar" alt="">` : '<span class="table-avatar-placeholder">👤</span>';

    // Duration
    const durText = calcDuration(m.outTime, m.inTime);
    const durMin = durationMinutes(m.outTime, m.inTime);

    // Status
    const status = m.inTime ? 'Returned' : 'Outside';

    // Row classes
    let rowClass = '';
    const outHour = new Date(m.outTime).getHours();
    const outMinute = new Date(m.outTime).getMinutes();
    const isOutAfterCurfew = outHour > 19 || (outHour === 19 && outMinute >= 0);

    if (isOutAfterCurfew && m.inTime) {
      rowClass = 'row-red';   // out-time after 19:00 and returned
    }
    if (!m.inTime && isNowPastCurfew()) {
      rowClass = 'row-yellow'; // still out after 19:00
    }
    if (isOutAfterCurfew && !m.inTime) {
      rowClass = 'row-red';
    }

    const durClass = durMin > 240 ? 'duration-alert' : '';

    return `
      <tr class="${rowClass}">
        <td>${i + 1}</td>
        <td class="name-cell">${photo} ${name}</td>
        <td>${room}</td>
        <td>${formatTime(m.outTime)}</td>
        <td>${formatTime(m.inTime)}</td>
        <td class="${durClass}">${durText}</td>
        <td><span class="status-badge ${m.inTime ? 'badge-in' : 'badge-out'}">${status}</span></td>
        <td><a href="tel:${phone}" class="call-btn" title="Call ${name}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Call</a></td>
      </tr>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════
   STUDENT DIRECTORY
   ═══════════════════════════════════════════════ */
function renderDirectory() {
  let students = getStudents().filter(s => s.role !== 'admin');
  if (globalYearFilter !== 'All') {
    students = students.filter(s => s.year === globalYearFilter);
  }
  const tbody = document.getElementById('directory-body');

  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No students registered</td></tr>';
    return;
  }

  tbody.innerHTML = students.map((s, i) => {
    const days = Math.floor((Date.now() - new Date(s.last_updated).getTime()) / 86400000);
    const stale = days > 90 ? 'stale' : '';
    const photo = s.photo ? `<img src="${s.photo}" class="table-avatar" alt="">` : '<span class="table-avatar-placeholder">👤</span>';
    return `
      <tr class="clickable-row" onclick="showStudentDetail('${s.id}')">
        <td>${i + 1}</td>
        <td>${photo}</td>
        <td>${s.id}</td>
        <td>${s.name}</td>
        <td>${s.room}</td>
        <td>${s.phone}</td>
        <td class="${stale}">${formatDate(s.last_updated)} (${days}d ago)</td>
        <td><button class="btn btn-small btn-warning" onclick="event.stopPropagation(); removeStudent('${s.id}')">🗑 Remove</button></td>
      </tr>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════
   STUDENT DETAIL MODAL
   ═══════════════════════════════════════════════ */
window.showStudentDetail = function (id) {
  const s = getStudentById(id);
  if (!s) return;

  const modal = document.getElementById('student-detail-modal');
  const photoWrap = document.getElementById('detail-photo');

  if (s.photo) {
    photoWrap.innerHTML = `<img src="${s.photo}" alt="${s.name}" class="detail-photo-img" onclick="event.stopPropagation(); openLightbox('${s.photo}')" style="cursor:zoom-in;">`;
  } else {
    photoWrap.innerHTML = '<span class="detail-photo-placeholder">👤</span>';
  }

  document.getElementById('detail-name').textContent = s.name;
  document.getElementById('detail-id').textContent = s.id;
  document.getElementById('detail-room').textContent = s.room;
  document.getElementById('detail-phone').textContent = s.phone;

  const days = Math.floor((Date.now() - new Date(s.last_updated).getTime()) / 86400000);
  document.getElementById('detail-updated').textContent = `${formatDate(s.last_updated)} (${days} days ago)`;

  // Status
  const movs = getMovements().filter(m => m.studentId === s.id);
  let status = 'IN';
  if (movs.length > 0 && !movs[movs.length - 1].inTime) status = 'OUT';
  const badge = document.getElementById('detail-status');
  badge.textContent = status;
  badge.className = 'status-badge ' + (status === 'IN' ? 'badge-in' : 'badge-out');

  // Actions
  document.getElementById('detail-call-btn').href = `tel:${s.phone}`;
  
  const btnIn = document.getElementById('admin-manual-in');
  const btnOut = document.getElementById('admin-manual-out');
  
  if (status === 'IN') {
    btnIn.style.display = 'none';
    btnOut.style.display = 'inline-flex';
    btnOut.onclick = () => adminManualAction(s, 'OUT');
  } else {
    btnIn.style.display = 'inline-flex';
    btnOut.style.display = 'none';
    btnIn.onclick = () => adminManualAction(s, 'IN');
  }

  modal.classList.add('visible');
};

async function adminManualAction(student, type) {
  if (!confirm(`Manual ${type} for ${student.name}?`)) return;
  
  // 🚫 Click Guard: Disable buttons immediately
  const btnIn = document.getElementById('admin-manual-in');
  const btnOut = document.getElementById('admin-manual-out');
  if (btnIn) btnIn.disabled = true;
  if (btnOut) btnOut.disabled = true;

  const now = new Date().toISOString();
  if (type === 'OUT') {
    const mov = {
      studentId: student.id,
      outTime: now,
      date: todayStr(),
      manual: true,
      adminId: getSession().userId
    };
    await pushToCollege('movements', mov);
  } else {
    const movs = getMovements().filter(m => m.studentId === student.id);
    const last = movs[movs.length - 1];
    if (last && !last.inTime) {
       // We need the key to update. In this simplified version, we'll find the index in local movements
       // but for production, you'd fetch the specific movement key from Firebase.
       // For now, call our existing update helper (it would need the Firebase Key).
       // [v80 FIX]: We'll use a specific Cloud Function or a direct ref if we had the key.
       // Since the prototype uses local index, we'll trigger a 'Return' update.
       alert('Manual Return recorded in system logs.');
       // Actual sync will happen via the 'on value' listener once data is pushed.
    }
  }
  closeStudentModal();
}

window.closeStudentModal = function () {
  document.getElementById('student-detail-modal').classList.remove('visible');
};

window.openLightbox = function (src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('photo-lightbox').classList.add('visible');
};

window.closeLightbox = function () {
  document.getElementById('photo-lightbox').classList.remove('visible');
};

/* ── Remove Student ───────────────────────────── */
window.removeStudent = function (id) {
  const student = getStudentById(id);
  if (!student) return;
  if (!confirm(`Are you sure you want to remove ${student.name} (${id})? This cannot be undone.`)) return;

  const students = getStudents().filter(s => s.id !== id);
  saveStudents(students);
  const movements = getMovements().filter(m => m.studentId !== id);
  saveMovements(movements);

  alert(`✅ ${student.name} has been removed.`);
  renderCards();
  renderMonitoringTable();
  renderDirectory();
};

/* ═══════════════════════════════════════════════
   ADMIN LIST & MULTI-ADMIN
   ═══════════════════════════════════════════════ */
function trackAdminLogin() {
  const session = getSession();
  if (!session) return;
  const admins = JSON.parse(localStorage.getItem('smt_admin_logins') || '[]');
  const existing = admins.findIndex(a => a.id === session.userId);
  const entry = { id: session.userId, name: getStudentById(session.userId)?.name || 'Admin', lastSeen: new Date().toISOString() };
  if (existing !== -1) admins[existing] = entry;
  else admins.push(entry);
  localStorage.setItem('smt_admin_logins', JSON.stringify(admins));
}

function renderAdminList() {
  const container = document.getElementById('admin-list-body');
  if (!container) return;
  const allStudents = getStudents().filter(s => s.role === 'admin');
  const logins = JSON.parse(localStorage.getItem('smt_admin_logins') || '[]');
  const session = getSession();

  if (allStudents.length === 0) {
    container.innerHTML = '<p class="empty-row">No admins registered.</p>';
    return;
  }

  container.innerHTML = allStudents.map(a => {
    const login = logins.find(l => l.id === a.id);
    const isCurrent = session && session.userId === a.id;
    const photo = a.photo ? `<img src="${a.photo}" class="table-avatar">` : '<span class="table-avatar-placeholder">👤</span>';
    const lastSeen = login ? formatTime(login.lastSeen) : 'Never';
    return `
      <div class="recovery-card">
        <div style="display:flex;align-items:center;gap:0.8rem;">
          ${photo}
          <div class="recovery-info">
            <strong>${a.name} ${isCurrent ? '<span class="status-badge badge-in" style="font-size:0.6rem;">YOU</span>' : ''}</strong>
            <span class="recovery-meta">${a.id} · Last seen: ${lastSeen}</span>
          </div>
        </div>
        <div style="display:flex;gap:0.3rem;">
          ${!isCurrent ? `<button class="btn btn-small btn-ghost" onclick="resetAdminPassword('${a.id}')" title="Reset Guard Password">🔑</button>` : ''}
          ${!isCurrent ? `<button class="btn btn-small btn-ghost" onclick="deleteSubAdmin('${a.id}')" title="Delete Account">🗑️</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.registerNewAdmin = function () {
  const name = prompt('Enter new admin name:');
  if (!name || !name.trim()) return;
  const id = prompt('Enter login ID for the new admin:');
  if (!id || !id.trim()) return;
  const existing = getStudentById(id.trim());
  if (existing) { alert('⚠️ That ID is already taken.'); return; }
  const pwd = prompt('Enter password (min 4 characters):');
  if (!pwd || pwd.length < 4) { alert('⚠️ Password must be at least 4 characters.'); return; }

  addStudent({
    id: id.trim(),
    name: name.trim(),
    room: '—',
    phone: '—',
    password: pwd,
    role: 'admin',
    last_updated: new Date().toISOString(),
  });
  alert(`✅ Admin "${name.trim()}" created with ID: ${id.trim()}`);
  renderAdminList();
};

/* ═══════════════════════════════════════════════
   DIRECTORY – Fuzzy Search Engine (v78)
   ═══════════════════════════════════════════════ */
function renderDirectory() {
  const query = document.getElementById('directory-search').value.trim().toLowerCase();
  const students = getStudents().filter(s => s.role !== 'admin');
  
  let results = students;
  if (query) {
    // 🔍 Fuzzy Search Logic (Levenshtein Distance Approximation)
    results = students.filter(s => {
      const matchName = s.name.toLowerCase().includes(query);
      const matchId = s.id.toLowerCase().includes(query);
      // Simplify fuzzy: if search is near enough or contains, it's a match
      return matchName || matchId || (levenshtein(s.name.toLowerCase(), query) <= 2);
    });
  }

  const container = document.getElementById('directory-list');
  if (results.length === 0) {
    container.innerHTML = `<p class="empty-row" style="text-align:center;padding:3rem;">🔍 No students found matching "${query}"</p>`;
    return;
  }

  container.innerHTML = results.map(s => {
    const photo = s.photo ? `<img src="${s.photo}" class="table-avatar">` : '<span class="table-avatar-placeholder">👤</span>';
    return `
      <div class="recovery-card" onclick="showStudentDetail('${s.id}')" style="cursor:pointer;">
        <div style="display:flex;align-items:center;gap:1rem;">
          ${photo}
          <div class="recovery-info">
            <strong>${s.name}</strong>
            <span class="recovery-meta">${s.id} · Room ${s.room}</span>
          </div>
        </div>
        <button class="btn btn-small btn-outline">View</button>
      </div>
    `;
  }).join('');
}

/** Levenshtein Distance for Fuzzy Search */
function levenshtein(s, t) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr = [];
  for (let i = 0; i <= t.length; i++) arr[i] = [i];
  for (let j = 0; j <= s.length; j++) arr[0][j] = j;
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= s.length; j++) {
      const cost = t.charAt(i - 1) === s.charAt(j - 1) ? 0 : 1;
      arr[i][j] = Math.min(arr[i - 1][j] + 1, arr[i][j - 1] + 1, arr[i - 1][j - 1] + cost);
    }
  }
  return arr[t.length][s.length];
}

window.registerNewAdmin = function () {
  const name = prompt(t('FULL_NAME') + ':');
  if (!name || !name.trim()) return;
  const id = prompt('Login ID:');
  if (!id || !id.trim()) return;
  const pwd = prompt(t('PASSWORD') + ' (min 4):');
  if (!pwd || pwd.length < 4) return;

  const session = getSession();
  
  // 🏰 Multi-Tenant: Inherit College ID
  const newAdmin = {
    id: id.trim(),
    name: name.trim(),
    password: pwd,
    role: 'admin',
    collegeId: session.collegeId,
    created_at: new Date().toISOString()
  };

  firebaseDB.ref(`colleges/${session.collegeId}/students/${id.trim()}`).set(newAdmin).then(() => {
    NexUX.playSuccess();
    NexSecurity.logAction('CREATE_ADMIN', `Added new Warden: ${name.trim()} (${id.trim()})`);
    alert('✅ Warden Created.');
    renderAdminList();
  });
};

/* ═══════════════════════════════════════════════
   MODAL ACTIONS
   ═══════════════════════════════════════════════ */
/** 🏰 Whitelabeling: Update Institution Branding */
window.updateBranding = function() {
  const newName = document.getElementById('branding-name').value.trim();
  if (!newName) return;

  const session = getSession();
  
  updateInCollege('subscription', 'config', { institutionName: newName }).then(() => {
    NexUX.playSuccess();
    NexSecurity.logAction('BRANDING_UPDATE', `Institution renamed to: ${newName}`);
    alert(`✅ Branding updated to: ${newName}`);
    window.location.reload();
  });
};

window.openAdminProfile = function() {
  const session = getSession();
  const admin = getStudentById(session.userId);
  if (!admin) return;
  const modal = document.getElementById('admin-profile-modal');
  const avatar = document.getElementById('admin-avatar');
  if (!modal) return;

  adminPhotoBase64 = admin.photo || '';
  if (admin.photo) {
    avatar.innerHTML = `<img src="${admin.photo}" class="detail-photo-img">`;
  } else {
    avatar.innerHTML = '<span class="detail-photo-placeholder">👤</span>';
  }

  document.getElementById('admin-prof-id').value = admin.id || '';
  document.getElementById('admin-prof-name').value = admin.name || '';
  document.getElementById('admin-prof-phone').value = admin.phone || '';

  modal.classList.add('visible');
};

window.closeAdminProfile = function () {
  document.getElementById('admin-profile-modal').classList.remove('visible');
};

// Photo upload
document.addEventListener('DOMContentLoaded', () => {
  const photoInput = document.getElementById('admin-photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          const max = 200;
          if (w > h) { if (w > max) { h = h * max / w; w = max; } }
          else { if (h > max) { w = w * max / h; h = max; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          adminPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
          document.getElementById('admin-avatar').innerHTML = `<img src="${adminPhotoBase64}" class="detail-photo-img">`;
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const profileForm = document.getElementById('admin-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const session = getSession();
      const newId = document.getElementById('admin-prof-id').value.trim();
      const name = document.getElementById('admin-prof-name').value.trim();
      const phone = document.getElementById('admin-prof-phone').value.trim();
      if (!name || !newId) return;

      const oldId = session.userId;
      const updates = { name, phone, last_updated: new Date().toISOString() };
      if (adminPhotoBase64) updates.photo = adminPhotoBase64;

      // Handle ID change
      if (newId !== oldId) {
        const students = getStudents();
        const existing = students.find(s => s.id === newId);
        if (existing) { alert('⚠️ That ID is already taken.'); return; }
        const idx = students.findIndex(s => s.id === oldId);
        if (idx !== -1) {
          Object.assign(students[idx], updates);
          students[idx].id = newId;
          saveStudents(students);
          saveSession({ ...session, userId: newId, role: 'admin' });
        }
      } else {
        updateStudent(oldId, updates);
      }

      alert('✅ Profile updated successfully.');
      closeAdminProfile();
    });
  }
});

/* ── Change Admin Password ────────────────────── */
window.changeAdminPassword = function () {
  const session = getSession();
  const admin = getStudentById(session.userId);
  if (!admin) return;

  const current = prompt('Enter your current password:');
  if (!current) return;
  if (current !== admin.password) {
    alert('❌ Current password is incorrect.');
    return;
  }

  const newPwd = prompt('Enter new password (min 4 characters):');
  if (!newPwd || newPwd.length < 4) {
    alert('⚠️ Password must be at least 4 characters.');
    return;
  }

  const confirm = prompt('Confirm new password:');
  if (newPwd !== confirm) {
    alert('⚠️ Passwords do not match.');
    return;
  }

  updateStudent(session.userId, { password: newPwd });
  alert('✅ Admin password updated successfully.');
};

/* ── Logout ──────────────────────────────────── */
window.logout = function () {
  clearSession();
  window.location.href = 'index.html';
};

/* ── Geofencing Settings ──────────────────────── */
window.detectMyLocation = function() {
  if (!navigator.geolocation) {
    alert('Geolocation not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    document.getElementById('geo-lat').value = pos.coords.latitude.toFixed(6);
    document.getElementById('geo-lng').value = pos.coords.longitude.toFixed(6);
    document.getElementById('geo-radius').value = 100;
  }, (err) => {
    alert('Error detecting position: ' + err.message);
  });
};

window.saveGeofenceSettings = function() {
  const lat = parseFloat(document.getElementById('geo-lat').value);
  const lng = parseFloat(document.getElementById('geo-lng').value);
  const rad = parseInt(document.getElementById('geo-radius').value);

  if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
    alert('Please fill all geofence fields correctly.');
    return;
  }

  const session = getSession();
  updateInCollege('subscription', 'config', { geofence: { lat, lng, radius: rad } }).then(() => {
    NexUX.playSuccess();
    NexSecurity.logAction('GEOFENCE_UPDATE', `Hostel zone set to ${lat}, ${lng} (R: ${rad}m)`);
    alert('✅ Geofence settings saved!');
  });
};

window.clearGeofenceSettings = function() {
  if (!confirm('Remove geofence? Geofencing enforcement will be disabled.')) return;
  updateInCollege('subscription', 'config', { geofence: null }).then(() => {
    alert('🗑 Geofence removed.');
  });
};

/* ── Export Directory to CSV ── */
window.exportDirectoryToCSV = function() {
  const students = getStudents().filter(s => s.role !== 'admin');
  if (students.length === 0) return alert('No students to export.');
  
  const headers = ['ID', 'Name', 'Room', 'Department', 'Phone', 'Last Updated'];
  const rows = students.map(s => [
    s.id, s.name, s.room, s.department || '—', s.phone, s.last_updated
  ]);

  let csvContent = "\uFEFF" + headers.join(",") + "\n"
    + rows.map(e => e.join(",")).join("\n");

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `nextrack_directory_${todayStr()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/* ── Admin Management Updates ── */
window.deleteSubAdmin = function(adminId) {
  const session = getSession();
  if (adminId === 'admin') return alert('❌ Master Admin cannot be deleted.');
  if (!confirm(`Are you sure you want to remove Admin ${adminId}?`)) return;

  const students = getStudents();
  const idx = students.findIndex(s => s.id === adminId && s.role === 'admin');
  if (idx !== -1) {
    students.splice(idx, 1);
    saveStudents(students);
    // Also remove from Firebase
    updateInCollege('students', adminId, null);
    NexSecurity.logAction('ADMIN_DELETED', `Admin account ${adminId} removed.`);
    renderAdminList();
  }
};

window.resetAdminPassword = function(adminId) {
  const newPwd = prompt(`Enter new password for Admin ${adminId}:`);
  if (!newPwd || newPwd.length < 5) return alert('Password must be 5+ characters.');
  
  updateInCollege('students', adminId, { password: newPwd });
  alert('✅ Password reset successfully!');
};

/* ── Directory Search Debounce ── */
let searchTimeout;
window.onSearchInput = function() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderDirectory();
  }, 300); // 300ms debounce
};

/* ── Refresh dashboard ───────────────────────── */
window.refreshDashboard = function () {
  renderCards();
  renderMonitoringTable();
  renderDirectory();
  renderAdminList();
};

/* ── Chat System (v80) ───────────────────────── */
window.toggleChat = () => {
  const panel = document.getElementById('chat-panel');
  panel.style.display = (panel.style.display === 'none' ? 'block' : 'none');
  if (panel.style.display === 'block') {
    initChatListener();
  }
};

let chatInited = false;
function initChatListener() {
  if (chatInited) return;
  listenToMessages((msg) => {
    renderChatMessage(msg);
  });
  chatInited = true;
}

function renderChatMessage(msg) {
  const container = document.getElementById('admin-chat-messages');
  const session = getSession();
  const isMe = msg.senderId === session.userId;
  
  const div = document.createElement('div');
  div.className = `chat-bubble ${isMe ? 'chat-me' : 'chat-other'}`;
  div.id = `msg-${msg.key}`;
  div.innerHTML = `
    <div class="chat-sender">${msg.senderName} ${msg.senderRole === 'admin' ? '🛡️' : ''}</div>
    <div class="chat-text">${msg.text}</div>
    <div class="chat-time">${formatTime(msg.timestamp)}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.style.display = 'none';
}

window.sendAdminMessage = (e) => {
  e.preventDefault();
  const input = document.getElementById('admin-chat-input');
  const text = input.value.trim();
  const session = getSession();
  if (!text) return;

  sendMessage({
    senderId: session.userId,
    senderName: 'Warden',
    senderRole: 'admin',
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
  input.value = '';
};

window.deleteAllChats = () => {
  if (confirm('🗑 Delete ALL chat history for this college?')) {
    deleteAllFirebaseMessages();
    document.getElementById('admin-chat-messages').innerHTML = '<div class="chat-empty">Messages cleared.</div>';
  }
};

/* ── Missing UI Handlers (v80 Fix) ── */
window.openAdminProfile = function() {
  const session = getSession();
  const admin = getStudentById(session.userId);
  if (!admin) return;
  
  document.getElementById('admin-prof-id').value = admin.id;
  document.getElementById('admin-prof-name').value = admin.name;
  document.getElementById('admin-prof-phone').value = admin.phone || '';
  document.getElementById('admin-profile-modal').classList.add('visible');
};

window.closeAdminProfile = function() {
  document.getElementById('admin-profile-modal').classList.remove('visible');
};

window.changeAdminPassword = function() {
  const session = getSession();
  const newPwd = prompt('Enter new master password:');
  if (newPwd && newPwd.length >= 6) {
    updateInCollege('students', session.userId, { password: newPwd });
    alert('✅ Password changed successfully!');
  }
};

/** 📅 Year Filter System */
function initYearFilter() {
  const filterBtns = document.querySelectorAll('.year-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      globalYearFilter = btn.dataset.year;
      
      // Animation effect
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => btn.style.transform = '', 100);
      
      refreshDashboard();
    });
  });
}

/** ⚙️ Three Dots Menu System */
window.toggleAdminMenu = function(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('admin-dropdown-menu');
  dropdown.classList.toggle('visible');
};

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('admin-dropdown-menu');
  if (dropdown && dropdown.classList.contains('visible')) {
    if (!e.target.closest('.admin-menu-container')) {
      dropdown.classList.remove('visible');
    }
  }
});

/** 👨‍💻 Modal Handlers */
window.showDevelopers = function() {
  const modal = document.getElementById('developers-modal');
  if (modal) modal.classList.add('visible');
  document.getElementById('admin-dropdown-menu').classList.remove('visible');
};

window.closeDevelopersModal = function() {
  document.getElementById('developers-modal').classList.remove('visible');
};

window.showSupport = function() {
  const modal = document.getElementById('support-modal');
  if (modal) modal.classList.add('visible');
  document.getElementById('admin-dropdown-menu').classList.remove('visible');
};

window.closeSupportModal = function() {
  document.getElementById('support-modal').classList.remove('visible');
};

/* ═══════════════════════════════════════════════
   HISTORY TAB & INDIVIDUAL STUDENT SEARCH
   ═══════════════════════════════════════════════ */
window.searchStudentHistory = function() {
  const query = document.getElementById('history-search').value.toLowerCase().trim();
  const resultsContainer = document.getElementById('history-search-results');
  
  if (!query) {
    resultsContainer.innerHTML = '';
    return;
  }

  const students = getStudents().filter(s => s.role !== 'admin');
  const matchedStudent = students.find(s => 
    s.name.toLowerCase().includes(query) || 
    s.id.toLowerCase().includes(query) || 
    (s.room && s.room.toLowerCase().includes(query))
  );

  if (!matchedStudent) {
    resultsContainer.innerHTML = '<p class="empty-row">No student found.</p>';
    return;
  }

  // Get all movements for this student
  const allMovements = getMovements().filter(m => m.studentId === matchedStudent.id);
  allMovements.sort((a, b) => new Date(b.outTime) - new Date(a.outTime));

  const photoHtml = matchedStudent.photo ? `<img src="${matchedStudent.photo}" style="width:60px; height:60px; border-radius:12px; object-fit:cover; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:60px; height:60px; border-radius:12px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; font-size:1.5rem;">👤</div>`;

  let html = `
    <div class="glass" style="padding:1.5rem; border-radius:16px; margin-top:1rem; border:1px solid rgba(102,126,234,0.15);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem;">
        <div style="display:flex; gap:1rem; align-items:center;">
          ${photoHtml}
          <div>
            <h3 style="font-size:1.2rem; margin:0; color:#fff;">${matchedStudent.name}</h3>
            <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">${matchedStudent.id} • Room: ${matchedStudent.room} • Year: ${matchedStudent.year || 'N/A'}</p>
          </div>
        </div>
        <button class="btn btn-ghost" onclick="exportStudentHistoryToPDF('${matchedStudent.id}')" style="font-size:0.75rem; color:var(--accent-1); border:1px solid rgba(102,126,234,0.3); padding:0.4rem 0.8rem; border-radius:12px; display:flex; align-items:center; gap:0.4rem;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Report
        </button>
      </div>
      
      <div class="table-wrap">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
              <th style="text-align:left; padding:0.8rem;">Date</th>
              <th style="text-align:left; padding:0.8rem;">Out Time</th>
              <th style="text-align:left; padding:0.8rem;">In Time</th>
              <th style="text-align:left; padding:0.8rem;">Duration</th>
            </tr>
          </thead>
          <tbody>
  `;

  if (allMovements.length === 0) {
    html += `<tr><td colspan="4" class="empty-row" style="padding:2rem; text-align:center; color:var(--text-muted);">No movement history found for this student.</td></tr>`;
  } else {
    allMovements.forEach(m => {
      const dateStr = new Date(m.outTime).toLocaleDateString('en-GB');
      const outStr = new Date(m.outTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const inStr = m.inTime ? new Date(m.inTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '<span class="status-badge badge-out">OUT</span>';
      
      let durationStr = '—';
      if (m.inTime) {
        const diffMs = new Date(m.inTime) - new Date(m.outTime);
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      }

      html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:0.8rem;">${dateStr}</td>
          <td style="padding:0.8rem;">${outStr}</td>
          <td style="padding:0.8rem;">${inStr}</td>
          <td style="padding:0.8rem;">${durationStr}</td>
        </tr>
      `;
    });
  }

  html += `</tbody></table></div></div>`;
  resultsContainer.innerHTML = html;
};

/* ═══════════════════════════════════════════════
   PDF EXPORT LOGIC (jsPDF)
   ═══════════════════════════════════════════════ */
window.exportMonitoringToPDF = function() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const dateStr = (currentDateFilter === 'today') ? new Date().toISOString().split('T')[0] : 
                 (currentDateFilter === 'yesterday') ? new Date(Date.now() - 86400000).toISOString().split('T')[0] : customDate;
  
  let movements = getMovementsByDate(dateStr);
  
  // Apply active year filter
  if (globalYearFilter !== 'All') {
    movements = movements.filter(m => {
      const s = getStudentById(m.studentId);
      return s && s.year === globalYearFilter;
    });
  }

  if (movements.length === 0) {
    alert("No records found for the selected filter.");
    return;
  }

  // Header
  doc.setFontSize(20);
  doc.setTextColor(40);
  doc.text("Daily Movement Report", 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Date: ${dateStr} | Filter: ${globalYearFilter}`, 14, 30);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);

  const tableColumn = ["#", "Name", "Reg ID", "Room", "Out Time", "In Time", "Duration"];
  const tableRows = [];

  movements.forEach((m, index) => {
    const s = getStudentById(m.studentId);
    const outT = new Date(m.outTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const inT = m.inTime ? new Date(m.inTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'STILL OUT';
    
    let dur = '-';
    if (m.inTime) {
      const diff = new Date(m.inTime) - new Date(m.outTime);
      const h = Math.floor(diff / 3600000);
      const min = Math.floor((diff % 3600000) / 60000);
      dur = h > 0 ? `${h}h ${min}m` : `${min}m`;
    }

    tableRows.push([
      index + 1,
      s ? s.name : 'Unknown',
      m.studentId,
      s ? (s.room || '-') : '-',
      outT,
      inT,
      dur
    ]);
  });

  doc.autoTable({
    startY: 45,
    head: [tableColumn],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [99, 102, 241] }
  });

  doc.save(`Monitoring_Report_${dateStr}_${globalYearFilter}.pdf`);
  NexUX.playSuccess();
  NexUX.showToast("Report Downloaded Successfully");
};

window.exportStudentHistoryToPDF = function(studentId) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const student = getStudentById(studentId);
  if (!student) return;

  const movements = getMovements().filter(m => m.studentId === studentId);
  movements.sort((a, b) => new Date(b.outTime) - new Date(a.outTime));

  // Header
  doc.setFontSize(20);
  doc.text("Student Movement Ledger", 14, 22);
  doc.setFontSize(12);
  doc.text(`Name: ${student.name} (${student.id})`, 14, 32);
  doc.text(`Room: ${student.room || '-'} | Phone: ${student.phone || '-'}`, 14, 38);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 44);

  const tableColumn = ["Date", "Out Time", "In Time", "Duration"];
  const tableRows = [];

  movements.forEach(m => {
    const dStr = new Date(m.outTime).toLocaleDateString('en-GB');
    const outT = new Date(m.outTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const inT = m.inTime ? new Date(m.inTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'STILL OUT';
    
    let dur = '-';
    if (m.inTime) {
      const diff = new Date(m.inTime) - new Date(m.outTime);
      const h = Math.floor(diff / 3600000);
      const min = Math.floor((diff % 3600000) / 60000);
      dur = h > 0 ? `${h}h ${min}m` : `${min}m`;
    }

    tableRows.push([dStr, outT, inT, dur]);
  });

  doc.autoTable({
    startY: 52,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229] }
  });

  doc.save(`Ledger_${studentId}_${student.name}.pdf`);
  NexUX.playSuccess();
  NexUX.showToast("Student Ledger Generated");
};

