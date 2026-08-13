/* ──────────────────────────────────────────────
   admin.js  –  Dashboard, Monitoring, Management
   ────────────────────────────────────────────── */

let currentDateFilter = 'today';
let customDate = '';
let globalYearFilter = 'All';
let curfewInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  document.body.style.overflow = 'hidden'; // Lock scroll during startup
  const loader = document.getElementById('startup-loader');
  const msgEl = document.getElementById('startup-msg');
  const messages = [
    "Securely Synchronizing...",
    "NexTrack | Enterprise Intelligence",
    "Verifying Admin Credentials...",
    "Team Titans | Precision Systems",
    "Welcome back. — Provided by Team Titans"
  ];
  
  let msgIdx = 0;
  const msgInterval = setInterval(() => {
    if (msgEl) {
      msgEl.style.opacity = 0;
      setTimeout(() => {
        msgEl.textContent = messages[msgIdx % messages.length];
        msgEl.style.opacity = 1;
        msgIdx++;
      }, 200);
    }
  }, 600); // Faster messaging

  const startTime = Date.now();

  initCloudSync(() => {
    const session = getSession();
    
    // Fake Admin Bypass Lockdown (Bug #2)
    const adminUser = getStudents().find(s => s.id === session?.userId && s.role === 'admin');
    if (!session || session.role !== 'admin' || !adminUser || session.hash !== adminUser.password) {
      console.warn("🚨 Unauthorized Admin Access Attempt Blocked.");
      clearSession();
      window.location.href = 'index.html';
      return;
    }

    try {
      initTabs();
      initDashboard();
      startCurfewCheck();

      // The Magic: Listen for any cloud updates and instantly re-render!
      window.addEventListener('db_updated', refreshDashboard);
    } catch (err) {
      console.error("🚨 Dashboard Initialization Error:", err);
      // We still want to hide the loader so the admin can at least see the page
    } finally {
      // Fade out loader after min 0.4s (GUARANTEED)
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 400 - elapsed);

      setTimeout(() => {
        clearInterval(msgInterval);
        if (loader) loader.classList.add('fade-out');
        document.body.style.overflow = ''; // Unlock scroll
      }, remaining);
    }
  });
});

/* ═══════════════════════════════════════════════
   DASHBOARD – Status Cards
   ═══════════════════════════════════════════════ */
function initDashboard() {
  applyRoleRestrictions();
  renderCards();
  renderMonitoringTable();
  renderDirectory();
  trackAdminLogin();
  renderAdminList();
  initGeofenceUI();

  // Reactive Geofence UI updates
  window.addEventListener('db_updated', () => {
    initGeofenceUI();
  });

  // 📡 Live Sync Connection Monitor
  if (typeof firebaseDB !== 'undefined') {
    firebaseDB.ref('.info/connected').on('value', (snap) => {
      const dot = document.getElementById('sync-indicator');
      if (dot) {
        if (snap.val() === true) {
          dot.className = 'sync-dot online';
          dot.title = 'Live Sync: Connected';
        } else {
          dot.className = 'sync-dot offline';
          dot.title = 'Live Sync: Disconnected';
        }
      }
    });
  }
}

/* ═══════════════════════════════════════════════
   ROLE RESTRICTIONS (Master vs Sub-Admin)
   ═══════════════════════════════════════════════ */
function applyRoleRestrictions() {
  const session = getSession();
  if (!session) return;
  const adminUser = getStudentById(session.userId);
  if (!adminUser) return;

  // If this is a Sub-Admin (they have an allocated_year and are not the master 'admin')
  if (adminUser.id !== 'admin' && adminUser.allocated_year) {
    globalYearFilter = adminUser.allocated_year;

    // Hide Year Filter Bar
    const filterBar = document.querySelector('.year-filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    // Hide Admins Tab
    const adminsTabBtn = document.querySelector('.admin-tab[data-panel="panel-admins"]');
    if (adminsTabBtn) adminsTabBtn.style.display = 'none';

    // Hide Settings Tab
    const settingsTabBtn = document.querySelector('.admin-tab[data-panel="panel-settings"]');
    if (settingsTabBtn) settingsTabBtn.style.display = 'none';
  }
}

function renderCards() {
  let students = getStudents().filter(s => s.role !== 'admin');
  if (globalYearFilter !== 'All') {
    students = students.filter(s => s.year === globalYearFilter);
  }
  const movements = getMovements();
  const total = students.length;

  // A student is "outside" if their latest movement has no inTime OR they blocked GPS
  let outsideCount = 0;
  students.forEach(s => {
    const isWait = s.location_status === 'REFUSED';
    const stuMovs = movements.filter(m => m.studentId === s.id);
    const latest = stuMovs.length > 0 ? stuMovs[stuMovs.length - 1] : null;
    const isOut = latest && !latest.inTime;

    if (isOut || isWait) outsideCount++;
  });

  const insideCount = total - outsideCount;

  document.getElementById('card-total').textContent = total;
  document.getElementById('card-inside').textContent = insideCount;
  document.getElementById('card-outside').textContent = outsideCount;

  // 7:01 PM Trigger
  const outsideCard = document.getElementById('outside-card');
  if (isNowPastCurfew() && outsideCount > 0) {
    outsideCard.classList.add('blink-alert');
  } else {
    outsideCard.classList.remove('blink-alert');
  }
}

window.showOutsideStudents = function () {
  let students = getStudents().filter(s => s.role !== 'admin');
  if (globalYearFilter !== 'All') {
    students = students.filter(s => s.year === globalYearFilter);
  }
  const movements = getMovements();
  const outsideList = [];

  students.forEach(s => {
    const isWait = s.location_status === 'REFUSED';
    const stuMovs = movements.filter(m => m.studentId === s.id);
    const latest = stuMovs.length > 0 ? stuMovs[stuMovs.length - 1] : null;
    const isOut = latest && !latest.inTime;

    if (isOut || isWait) {
      outsideList.push({ 
        student: s, 
        outTime: isOut ? latest.outTime : (latest ? latest.inTime : new Date().toISOString()) 
      });
    }
  });

  const container = document.getElementById('outside-list');
  if (outsideList.length === 0) {
    container.innerHTML = '<p class="empty-row">All students are inside. 🎉</p>';
  } else {
    container.innerHTML = outsideList.map(item => {
      const s = item.student;
      const isBlocked = s.location_status === 'REFUSED';
      const photo = s.photo ? `<img src="${s.photo}" class="table-avatar">` : '<span class="table-avatar-placeholder">👤</span>';
      
      return `
        <div class="recovery-card ${isBlocked ? 'location-refused' : ''}" onclick="document.getElementById('outside-modal').classList.remove('visible'); showStudentDetail('${s.id}');" style="cursor:pointer; position:relative; overflow:hidden;">
          ${isBlocked ? '<div class="blocked-badge">📍 GPS BLOCKED</div>' : ''}
          <div style="display:flex;align-items:center;gap:0.8rem;">
            ${photo}
            <div class="recovery-info">
              <strong>${s.name}</strong>
              ${isBlocked ? '<div class="blocked-subtitle">location turn off</div>' : ''}
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
  }, 30000); // every 30 seconds
}

/* ═══════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════ */
function initTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const targetPanel = document.getElementById(tab.dataset.panel);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }

      try {
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } catch(e) {
        // Safe fallback for older browsers
      }
    });
  });

  // Date filter buttons
  document.getElementById('filter-today').addEventListener('click', () => setDateFilter('today'));
  document.getElementById('filter-yesterday').addEventListener('click', () => setDateFilter('yesterday'));
  document.getElementById('filter-custom-btn').addEventListener('click', () => {
    const val = document.getElementById('filter-custom-date').value;
    if (val) {
      customDate = val;
      setDateFilter('custom');
    }
  });
  // Year filter buttons
  document.querySelectorAll('.year-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.year-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      globalYearFilter = btn.dataset.year;
      refreshDashboard();
    });
  });
}

function setDateFilter(mode) {
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

  const movements = getMovementsByDate(dateStr).filter(m => {
    if (globalYearFilter === 'All') return true;
    const student = getStudentById(m.studentId);
    return student && student.year === globalYearFilter;
  });
  const tbody = document.getElementById('monitor-body');

  if (movements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No ${globalYearFilter !== 'All' ? globalYearFilter : ''} movements for this date</td></tr>`;
    return;
  }

  tbody.innerHTML = movements.map((m, i) => {
    const student = getStudentById(m.studentId);
    const name = student ? escapeHtml(student.name) : 'Unknown';
    const room = student ? escapeHtml(student.room) : '—';
    const phone = student ? escapeHtml(student.phone) : '—';
    const photo = student && student.photo ? `<img src="${student.photo}" class="table-avatar" alt="">` : '<span class="table-avatar-placeholder">👤</span>';

    // Duration
    const durText = calcDuration(m.outTime, m.inTime);
    const durMin = durationMinutes(m.outTime, m.inTime);

    // Status
    const status = m.inTime ? 'Returned' : 'Outside';

    // Row classes
    let rowClass = '';
    const isOutAfterCurfew = isAfterCurfew(m.outTime);

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
function renderDirectory(filteredStudents) {
  let source = filteredStudents || getStudents().filter(s => s.role !== 'admin');
  
  if (globalYearFilter !== 'All') {
    source = source.filter(s => s.year === globalYearFilter);
  }

  const students = source.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const tbody = document.getElementById('directory-body');

  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No students found</td></tr>';
    return;
  }

  tbody.innerHTML = students.map((s, i) => {
    const days = Math.floor((Date.now() - new Date(s.last_updated).getTime()) / 86400000);
    const stale = days > 90 ? 'stale' : '';
    const photo = s.photo ? `<img src="${s.photo}" class="table-avatar" alt="">` : '<span class="table-avatar-placeholder">👤</span>';
    return `
      <tr class="clickable-row" onclick="showStudentDetail('${escapeHtml(s.id)}')">
        <td>${i + 1}</td>
        <td>${photo}</td>
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.room)}</td>
        <td>${escapeHtml(s.phone)}</td>
        <td class="${stale}">${formatDate(s.last_updated)} (${days}d ago)</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-small btn-accent" onclick="event.stopPropagation(); adminEditStudent('${s.id}')">✏️ Edit</button>
          <button class="btn btn-small btn-warning" onclick="event.stopPropagation(); removeStudent('${s.id}')">🗑 Remove</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.searchDirectory = function() {
  const query = document.getElementById('directory-search').value.toLowerCase().trim();
  const students = getStudents().filter(s => s.role !== 'admin');
  
  if (!query) {
    renderDirectory();
    return;
  }

  const filtered = students.filter(s => 
    (s.id || '').toLowerCase().includes(query) || 
    (s.name || '').toLowerCase().includes(query) || 
    (s.room || '').toLowerCase().includes(query) ||
    (s.phone && s.phone.includes(query))
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  renderDirectory(filtered);
};

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

  modal.classList.add('visible');
};

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

  firebaseDB.ref('students/' + id).remove().then(() => {
    // Delete the student's movements individually
    const movements = getMovements().filter(m => m.studentId === id);
    movements.forEach(m => {
      firebaseDB.ref('movements/' + m.id).remove();
    });
    alert(`✅ ${student.name} has been removed.`);
    refreshDashboard();
  }).catch(err => {
    alert('❌ Failed to remove student: ' + err.message);
  });
};

/* ═══════════════════════════════════════════════
   ADMIN EDIT STUDENT (Password-Verified)
   ═══════════════════════════════════════════════ */
let editingStudentId = null;

window.adminEditStudent = async function (studentId) {
  const adminPwd = prompt('🔐 Enter your admin password to edit this student:');
  if (!adminPwd) return;

  const session = getSession();
  const admin = getStudentById(session.userId);
  const hashedAdminPwd = await hashPassword(adminPwd);
  if (!admin || hashedAdminPwd !== admin.password) {
    alert('❌ Incorrect admin password!');
    // Set warning alert on student profile
    updateStudent(studentId, { editAlert: 'warning', editAlertMsg: '⚠️ Someone attempted unauthorized access to your profile.' });
    return;
  }

  const s = getStudentById(studentId);
  if (!s) return;

  // Set editing alert on student profile
  updateStudent(studentId, { editAlert: 'editing', editAlertMsg: '🔒 Your account is currently under editing by an admin.' });
  editingStudentId = studentId;

  // Populate the edit form
  const photoWrap = document.getElementById('edit-stu-photo');
  if (s.photo) {
    photoWrap.innerHTML = `<img src="${s.photo}" class="detail-photo-img">`;
  } else {
    photoWrap.innerHTML = '<span class="detail-photo-placeholder">👤</span>';
  }

  document.getElementById('edit-stu-name').value = s.name || '';
  document.getElementById('edit-stu-id').value = s.id || '';
  document.getElementById('edit-stu-age').value = s.age || '';
  document.getElementById('edit-stu-dept').value = s.department || '';
  document.getElementById('edit-stu-room').value = s.room || '';
  document.getElementById('edit-stu-phone').value = s.phone || '';
  document.getElementById('edit-stu-email').value = s.email || '';
  document.getElementById('edit-stu-year').value = s.year || '';

  const alertEl = document.getElementById('admin-edit-alert');
  alertEl.style.display = 'block';
  alertEl.style.background = 'rgba(52,211,153,0.1)';
  alertEl.style.color = '#4ade80';
  alertEl.style.border = '1px solid rgba(52,211,153,0.2)';
  alertEl.textContent = '✅ Admin verified. You can now edit this student\'s profile and password.';

  document.getElementById('admin-edit-modal').classList.add('visible');
};

window.closeAdminEditModal = function () {
  document.getElementById('admin-edit-modal').classList.remove('visible');
  // Clear editing alert from student
  if (editingStudentId) {
    updateStudent(editingStudentId, { editAlert: null, editAlertMsg: null });
    editingStudentId = null;
  }
};

// Save edited student
document.addEventListener('DOMContentLoaded', () => {
  const editForm = document.getElementById('admin-edit-form');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editingStudentId) return;

      const newId = document.getElementById('edit-stu-id').value.trim();
      const name = document.getElementById('edit-stu-name').value.trim();
      const age = document.getElementById('edit-stu-age').value.trim();
      const dept = document.getElementById('edit-stu-dept').value.trim();
      const room = document.getElementById('edit-stu-room').value.trim();
      const phone = document.getElementById('edit-stu-phone').value.trim();
      const email = document.getElementById('edit-stu-email').value.trim();
      const year = document.getElementById('edit-stu-year').value;

      if (!name || !newId || !room || !phone) {
        alert('⚠️ Name, ID, Room, and Phone are required.');
        return;
      }

      const s = getStudentById(editingStudentId);

      const oldId = editingStudentId;
      const updates = { name, email, age, department: dept, room, phone, year, last_updated: new Date().toISOString(), editAlert: null, editAlertMsg: null };

      // Handle ID change
      if (newId !== oldId) {
        const students = getStudents();
        const existing = students.find(s => s.id === newId);
        if (existing) { alert('⚠️ That ID is already taken.'); return; }
        const idx = students.findIndex(s => s.id === oldId);
        if (idx !== -1) {
          const fullStudentData = { ...students[idx], ...updates, id: newId };
          firebaseDB.ref('students/' + newId).set(fullStudentData).then(() => {
            firebaseDB.ref('students/' + oldId).remove();
          });
          // Update movements individually
          const movements = getMovements().filter(m => m.studentId === oldId);
          movements.forEach(m => {
            firebaseDB.ref('movements/' + m.id).update({ studentId: newId });
          });
        }
      } else {
        updateStudent(oldId, updates);
      }

      editingStudentId = null;
      document.getElementById('admin-edit-modal').classList.remove('visible');
      alert('✅ Student profile updated successfully.');
      renderDirectory();
    });
  }
});

/* ═══════════════════════════════════════════════
   ADMIN LIST & MULTI-ADMIN
   ═══════════════════════════════════════════════ */
function trackAdminLogin() {
  const session = getSession();
  if (!session || typeof firebaseDB === 'undefined' || !firebaseDB) return;
  const entry = { id: session.userId, name: getStudentById(session.userId)?.name || 'Admin', lastSeen: new Date().toISOString() };
  firebaseDB.ref('admin_logins/' + session.userId).set(entry);
}

function renderAdminList() {
  const container = document.getElementById('admin-list-body');
  if (!container) return;
  const allStudents = getStudents().filter(s => s.role === 'admin');
  const logins = typeof fbAdminLogins !== 'undefined' ? fbAdminLogins : [];
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
    const allocatedYearText = a.allocated_year ? ` · <span style="color:var(--accent-primary);">${a.allocated_year}</span>` : ' · <span style="color:#ef4444;">Master</span>';
    return `
      <div class="recovery-card">
        <div style="display:flex;align-items:center;gap:0.8rem;">
          ${photo}
          <div class="recovery-info">
            <strong>${a.name} ${isCurrent ? '<span class="status-badge badge-in" style="font-size:0.6rem;">YOU</span>' : ''}</strong>
            <span class="recovery-meta">${a.id}${allocatedYearText} · Last seen: ${lastSeen}</span>
          </div>
        </div>
        ${!isCurrent ? `
        <div class="recovery-actions">
          <button class="btn btn-small btn-secondary" onclick="editSubAdmin('${a.id}')">✏️ Edit</button>
          <button class="btn btn-small" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.2);" onclick="removeAdmin('${a.id}')">🗑 Remove</button>
        </div>` : ''}
      </div>
    `;
  }).join('');
}

window.registerNewAdmin = function () {
  document.getElementById('add-admin-form').reset();
  document.getElementById('add-admin-modal').classList.add('visible');
};

document.getElementById('add-admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('add-admin-id').value.trim();
  const name = document.getElementById('add-admin-name').value.trim();
  const pwd = document.getElementById('add-admin-pwd').value;
  const yearNum = document.getElementById('add-admin-year').value;

  if (!/^[a-zA-Z0-9]+$/.test(id)) { alert('⚠️ Admin ID can only contain letters and numbers.'); return; }
  if (getStudentById(id)) { alert('⚠️ That ID is already taken.'); return; }
  if (pwd.length < 4) { alert('⚠️ Password must be at least 4 characters.'); return; }

  const allocatedYear = yearNum + (yearNum === '1' ? 'st' : yearNum === '2' ? 'nd' : yearNum === '3' ? 'rd' : 'th') + ' Year';
  const hashedPwd = await hashPassword(pwd);

  addStudent({
    id, name, room: '—', phone: '—',
    password: hashedPwd, role: 'admin', allocated_year: allocatedYear,
    last_updated: new Date().toISOString()
  });

  alert(`✅ Sub-Admin "${name}" created for ${allocatedYear}`);
  document.getElementById('add-admin-modal').classList.remove('visible');
  renderAdminList();
});

window.editSubAdmin = function (targetAdminId) {
  const targetAdmin = getStudentById(targetAdminId);
  if (!targetAdmin) return;

  document.getElementById('edit-admin-target-id').value = targetAdminId;
  document.getElementById('edit-admin-name').value = targetAdmin.name;
  document.getElementById('edit-admin-year').value = targetAdmin.allocated_year ? targetAdmin.allocated_year.charAt(0) : '1';
  document.getElementById('edit-admin-master-pwd').value = '';
  document.getElementById('edit-admin-modal').classList.add('visible');
};

document.getElementById('edit-admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const session = getSession();
  const currentAdmin = getStudentById(session.userId);
  if (!currentAdmin) return;

  const masterPwd = document.getElementById('edit-admin-master-pwd').value;
  const hashedMaster = await hashPassword(masterPwd);
  if (hashedMaster !== currentAdmin.password) {
    alert('❌ Incorrect master password! Unauthorized editing blocked.');
    return;
  }

  const targetId = document.getElementById('edit-admin-target-id').value;
  const newName = document.getElementById('edit-admin-name').value.trim();
  const yearNum = document.getElementById('edit-admin-year').value;

  const updates = { name: newName, last_updated: new Date().toISOString() };
  updates.allocated_year = yearNum + (yearNum === '1' ? 'st' : yearNum === '2' ? 'nd' : yearNum === '3' ? 'rd' : 'th') + ' Year';

  updateStudent(targetId, updates);
  alert(`✅ Admin "${targetId}" updated successfully!`);
  document.getElementById('edit-admin-modal').classList.remove('visible');
  renderAdminList();
});

window.removeAdmin = function (targetAdminId) {
  document.getElementById('delete-admin-target-id').value = targetAdminId;
  document.getElementById('delete-admin-target-label').textContent = targetAdminId;
  document.getElementById('delete-admin-master-pwd').value = '';
  document.getElementById('delete-admin-modal').classList.add('visible');
};

document.getElementById('delete-admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const session = getSession();
  const currentAdmin = getStudentById(session.userId);
  
  const masterPwd = document.getElementById('delete-admin-master-pwd').value;
  const hashedMaster = await hashPassword(masterPwd);
  if (hashedMaster !== currentAdmin.password) {
    alert('❌ Incorrect password! Unauthorized deletion blocked.');
    return;
  }

  const targetId = document.getElementById('delete-admin-target-id').value;
  
  if (typeof firebaseDB !== 'undefined' && firebaseDB) {
    firebaseDB.ref('students/' + targetId).remove().then(() => {
      firebaseDB.ref('admin_logins/' + targetId).remove();
      alert(`✅ Admin "${targetId}" has been deleted.`);
      document.getElementById('delete-admin-modal').classList.remove('visible');
      renderAdminList();
    }).catch(err => {
      alert('❌ Failed to delete admin: ' + err.message);
    });
  }
});


/* ═══════════════════════════════════════════════
   ACCOUNT RECOVERY
   ═══════════════════════════════════════════════ */
window.searchStudent = function () {
  const query = document.getElementById('recovery-search').value.trim().toLowerCase();
  const results = document.getElementById('recovery-results');

  if (!query) {
    results.innerHTML = '';
    return;
  }

  const students = getStudents().filter(s => s.role !== 'admin');
  const matches = students.filter(s =>
    s.id.toLowerCase().includes(query) ||
    s.name.toLowerCase().includes(query) ||
    s.room.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    results.innerHTML = '<p class="empty-row">No matching students found.</p>';
    return;
  }

  results.innerHTML = matches.map(s => `
    <div class="recovery-card">
      <div class="recovery-info">
        <strong>${escapeHtml(s.name)}</strong>
        <span class="recovery-meta">${escapeHtml(s.id)} · Room ${escapeHtml(s.room)} · ${escapeHtml(s.phone)}</span>
      </div>
      <div class="recovery-actions">
        <button class="btn btn-small btn-accent" onclick="editRoom('${escapeHtml(s.id)}')">Edit Room</button>
      </div>
    </div>
  `).join('');
};

window.resetPassword = async function (id) {
  const newPwd = prompt('Enter new password for ' + id + ':');
  if (newPwd && newPwd.length >= 4) {
    const hashedPwd = await hashPassword(newPwd);
    updateStudent(id, { password: hashedPwd });
    alert('✅ Password reset successfully.');
  } else if (newPwd) {
    alert('⚠️ Password must be at least 4 characters.');
  }
};

window.editRoom = function (id) {
  const newRoom = prompt('Enter new room number for ' + id + ':');
  if (newRoom && newRoom.trim()) {
    updateStudent(id, { room: newRoom.trim(), last_updated: new Date().toISOString() });
    alert('✅ Room updated successfully.');
    renderDirectory();
  }
};

/* ═══════════════════════════════════════════════
   ADMIN PROFILE
   ═══════════════════════════════════════════════ */
let adminPhotoBase64 = '';

window.openAdminProfile = function () {
  const session = getSession();
  const admin = getStudentById(session.userId);
  if (!admin) return;

  const modal = document.getElementById('admin-profile-modal');
  const avatar = document.getElementById('admin-avatar');

  adminPhotoBase64 = admin.photo || '';
  if (admin.photo) {
    avatar.innerHTML = `<img src="${admin.photo}" class="detail-photo-img">`;
  } else {
    avatar.innerHTML = '<span class="detail-photo-placeholder">👤</span>';
  }

  document.getElementById('admin-prof-id').value = admin.id || '';
  document.getElementById('admin-prof-name').value = admin.name || '';
  document.getElementById('admin-prof-phone').value = admin.phone || '';
  document.getElementById('admin-prof-email').value = admin.email || '';
  document.getElementById('admin-prof-old-pwd').value = '';
  document.getElementById('admin-prof-new-pwd').value = '';
  document.getElementById('admin-prof-confirm-pwd').value = '';

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
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const session = getSession();
      const currentAdmin = getStudentById(session.userId);
      if (!currentAdmin) return;

      const newId = document.getElementById('admin-prof-id').value.trim();
      const name = document.getElementById('admin-prof-name').value.trim();
      const phone = document.getElementById('admin-prof-phone').value.trim();
      const email = document.getElementById('admin-prof-email').value.trim();
      
      const oldPwd = document.getElementById('admin-prof-old-pwd').value;
      const newPwd = document.getElementById('admin-prof-new-pwd').value;
      const confirmPwd = document.getElementById('admin-prof-confirm-pwd').value;

      if (!name || !newId) return;

      if (newPwd) {
        if (!oldPwd) {
          alert('⚠️ You must enter your Old Password to change your password.');
          return;
        }
        const hashedOld = await hashPassword(oldPwd);
        if (hashedOld !== currentAdmin.password) {
          alert('❌ Old Password is incorrect.');
          return;
        }
        if (newPwd.length < 4) {
          alert('⚠️ New Password must be at least 4 characters.');
          return;
        }
        if (newPwd !== confirmPwd) {
          alert('⚠️ New Passwords do not match.');
          return;
        }
      }

      const oldId = session.userId;
      const updates = { name, phone, email, last_updated: new Date().toISOString() };
      if (adminPhotoBase64) updates.photo = adminPhotoBase64;
      
      if (newPwd) {
        updates.password = await hashPassword(newPwd);
      }

      // Handle ID change
      if (newId !== oldId) {
        const students = getStudents();
        const existing = students.find(s => s.id === newId);
        if (existing) { alert('⚠️ That ID is already taken.'); return; }
        const idx = students.findIndex(s => s.id === oldId);
        if (idx !== -1) {
          const fullAdminData = { ...students[idx], ...updates, id: newId };
          firebaseDB.ref('students/' + newId).set(fullAdminData).then(() => {
            firebaseDB.ref('students/' + oldId).remove();
          });
          setSession({ userId: newId, role: 'admin' });
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
window.changeAdminPassword = async function () {
  const session = getSession();
  const admin = getStudentById(session.userId);
  if (!admin) return;

  const current = prompt('Enter your current password:');
  if (!current) return;
  const hashedCurrent = await hashPassword(current);
  if (hashedCurrent !== admin.password) {
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

  const hashedNewPwd = await hashPassword(newPwd);
  updateStudent(session.userId, { password: hashedNewPwd });
  alert('✅ Admin password updated successfully.');
};

/* ── Logout ──────────────────────────────────── */
window.logout = function () {
  if (confirm('🚪 Are you sure you want to logout of NexTrack?')) {
    clearSession();
    window.location.href = 'index.html';
  }
};

/* ── Refresh dashboard ───────────────────────── */
window.refreshDashboard = function () {
  const session = getSession();
  if (session && session.userId) {
    const liveAdmin = getStudentById(session.userId);
    if (!liveAdmin || liveAdmin.role !== 'admin') {
      // Another admin just deleted us!
      alert('⚠️ Your admin privileges have been revoked or your account was deleted. Logging out.');
      clearSession();
      window.location.href = 'index.html';
      return;
    }
  }

  renderCards();
  renderMonitoringTable();
  searchDirectory();
  renderAdminList();

  // Reactive: If the outside modal is open, refresh it now!
  const outsideModal = document.getElementById('outside-modal');
  if (outsideModal && outsideModal.classList.contains('visible')) {
    window.showOutsideStudents();
  }
};

/* ═══════════════════════════════════════════════
   STUDENT HISTORY SEARCH
   ═══════════════════════════════════════════════ */
window.searchStudentHistory = function () {
  const query = document.getElementById('history-search').value.trim().toLowerCase();
  const container = document.getElementById('history-search-results');

  if (!query) {
    container.innerHTML = '';
    return;
  }

  let students = getStudents().filter(s => s.role !== 'admin');
  if (globalYearFilter !== 'All') {
    students = students.filter(s => s.year === globalYearFilter);
  }

  const matches = students.filter(s =>
    (s.id || '').toLowerCase().includes(query) ||
    (s.name || '').toLowerCase().includes(query) ||
    (s.room || '').toLowerCase().includes(query)
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (matches.length === 0) {
    container.innerHTML = '<p class="empty-row">No matching students found.</p>';
    return;
  }

  container.innerHTML = matches.map(s => {
    const photo = s.photo ? `<img src="${s.photo}" class="table-avatar">` : '<span class="table-avatar-placeholder">👤</span>';
    const movements = getMovements().filter(m => m.studentId === s.id);

    let status = 'IN';
    if (movements.length > 0 && !movements[movements.length - 1].inTime) status = 'OUT';

    let historyHTML = '';
    if (movements.length === 0) {
      historyHTML = '<p class="empty-row" style="margin:0.5rem 0;">No movement history.</p>';
    } else {
      const reversed = [...movements].reverse();
      historyHTML = `
        <div class="table-wrap" style="margin-top:0.8rem;">
          <table class="monitor-table" style="font-size:0.8rem;">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Out-Time</th>
                <th>In-Time</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${reversed.map((m, i) => {
        const durText = calcDuration(m.outTime, m.inTime);
        const durMin = durationMinutes(m.outTime, m.inTime);
        const durClass = durMin > 240 ? 'duration-alert' : '';
        const mStatus = m.inTime ? 'Returned' : 'Outside';
        const dateStr = formatDate(m.outTime);
        return `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${dateStr}</td>
                    <td>${formatTime(m.outTime)}</td>
                    <td>${formatTime(m.inTime)}</td>
                    <td class="${durClass}">${durText}</td>
                    <td><span class="status-badge ${m.inTime ? 'badge-in' : 'badge-out'}">${mStatus}</span></td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="history-card glass" style="margin-bottom:1.2rem;padding:1rem;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:0.5rem;">
          ${photo}
          <div class="recovery-info">
            <strong>${escapeHtml(s.name)}</strong>
            <span class="recovery-meta">${escapeHtml(s.id)} · Room ${escapeHtml(s.room)} · ${escapeHtml(s.department || '')} · ${escapeHtml(s.year || '')}</span>
          </div>
          <span class="status-badge ${status === 'IN' ? 'badge-in' : 'badge-out'}" style="margin-left:auto;">${status}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.3rem;">Total movements: ${movements.length}</div>
        ${historyHTML}
      </div>
    `;
  }).join('');
};

/* ═══════════════════════════════════════════════
   GEOFENCE SETTINGS
   ═══════════════════════════════════════════════ */
function initGeofenceUI() {
  const geo = getGeofence();
  const status = document.getElementById('geo-status');
  if (!status) return;
  if (geo) {
    document.getElementById('geo-lat').value = geo.lat || '';
    document.getElementById('geo-lng').value = geo.lng || '';
    document.getElementById('geo-radius').value = geo.radius || '';
    status.innerHTML = `<span style="color:#4ade80;">✅ Geofence active — ${geo.radius}m radius around (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)})</span>`;
  } else {
    status.innerHTML = '<span style="color:var(--text-muted);">No geofence configured. Check-in allowed from anywhere.</span>';
  }
}

window.saveGeofenceSettings = function () {
  const lat = parseFloat(document.getElementById('geo-lat').value);
  const lng = parseFloat(document.getElementById('geo-lng').value);
  const radius = parseInt(document.getElementById('geo-radius').value);
  const status = document.getElementById('geo-status');

  if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
    status.innerHTML = '<span style="color:#f87171;">⚠️ Please fill all fields with valid numbers.</span>';
    return;
  }
  if (radius < 10 || radius > 5000) {
    status.innerHTML = '<span style="color:#f87171;">⚠️ Radius must be between 10 and 5000 meters.</span>';
    return;
  }

  saveGeofence({ lat, lng, radius });
  status.innerHTML = `<span style="color:#4ade80;">✅ Geofence saved — ${radius}m radius around (${lat.toFixed(5)}, ${lng.toFixed(5)})</span>`;
  alert('✅ Geofence settings saved successfully!');
};

window.clearGeofenceSettings = function () {
  if (!confirm('Remove geofence? Students will be able to check-in from anywhere.')) return;
  
  if (typeof firebaseDB !== 'undefined' && firebaseDB) {
    firebaseDB.ref('geofence').remove().then(() => {
      alert('🗑 Geofence removed from cloud.');
    });
  }
  
  localStorage.removeItem('smt_geofence');
  document.getElementById('geo-lat').value = '';
  document.getElementById('geo-lng').value = '';
  document.getElementById('geo-radius').value = '';
  document.getElementById('geo-status').innerHTML = '<span style="color:var(--text-muted);">Geofence removed. Check-in allowed from anywhere.</span>';
};

window.detectMyLocation = function () {
  const status = document.getElementById('geo-status');
  if (!navigator.geolocation) {
    status.innerHTML = '<span style="color:#f87171;">⚠️ Geolocation is not supported by your browser.</span>';
    return;
  }

  status.innerHTML = '<span style="color:#fbbf24;">📡 Detecting location...</span>';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById('geo-lat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('geo-lng').value = pos.coords.longitude.toFixed(6);
      if (!document.getElementById('geo-radius').value) {
        document.getElementById('geo-radius').value = '100';
      }
      status.innerHTML = `<span style="color:#4ade80;">📍 Location detected: (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}) — Accuracy: ~${Math.round(pos.coords.accuracy)}m. Click "Save Geofence" to apply.</span>`;
    },
    (err) => {
      status.innerHTML = `<span style="color:#f87171;">❌ Location error: ${err.message}. Please enter coordinates manually or allow location access in browser settings.</span>`;
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
};

/* ═══════════════════════════════════════════════
   CHAT SYSTEM (Admin Side — Firebase)
   ═══════════════════════════════════════════════ */
let firebaseMessages = [];
let selectedMsgKey = null;
let longPressTimer = null;

function renderAdminChatFromMessages(msgs) {
  const container = document.getElementById('admin-chat-messages');
  if (!container) return;
  const session = getSession();

  firebaseMessages = msgs;

  if (msgs.length === 0) {
    container.innerHTML = '<div class="chat-empty">No messages yet. Start the conversation!</div>';
    updateChatBadge();
    return;
  }

  container.innerHTML = msgs.map(m => {
    const isMine = m.senderId === session.userId;
    const isAdminMsg = m.senderRole === 'admin';
    let bubbleClass = 'chat-bubble ';
    if (isMine) {
      bubbleClass += 'chat-bubble-sent';
    } else if (isAdminMsg) {
      bubbleClass += 'chat-bubble-admin';
    } else {
      bubbleClass += 'chat-bubble-received';
    }

    const time = new Date(m.timestamp);
    const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = time.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const editedTag = m.edited ? ' <span class="chat-edited">(edited)</span>' : '';

    return `
      <div class="${bubbleClass}" data-key="${m.firebaseKey}" data-sender="${m.senderId}"
           oncontextmenu="showMsgMenu(event, '${m.firebaseKey}', '${m.senderId}')"
           ontouchstart="startLongPress(event, '${m.firebaseKey}', '${m.senderId}')"
           ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()">
        ${!isMine ? `<span class="chat-sender">${escapeHtml(m.senderName)}${isAdminMsg ? ' 🛡️' : ''}</span>` : ''}
        <span>${escapeHtml(m.text)}${editedTag}</span>
        <span class="chat-time">${dateStr} ${timeStr}</span>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;

  const panel = document.getElementById('chat-panel');
  if (!panel || panel.style.display === 'none') {
    updateChatBadge();
  } else {
    sessionStorage.setItem('smt_chat_last_seen', msgs.length.toString());
    updateChatBadge();
  }
}

// Context menu handlers
window.showMsgMenu = function (e, key, senderId) {
  e.preventDefault();
  const session = getSession();
  if (senderId !== session.userId) return; // Only own messages

  selectedMsgKey = key;
  const menu = document.getElementById('msg-context-menu');
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 150) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
};

window.startLongPress = function (e, key, senderId) {
  const session = getSession();
  if (senderId !== session.userId) return;

  longPressTimer = setTimeout(() => {
    selectedMsgKey = key;
    const touch = e.touches[0];
    const menu = document.getElementById('msg-context-menu');
    menu.style.display = 'block';
    menu.style.left = Math.min(touch.clientX, window.innerWidth - 150) + 'px';
    menu.style.top = Math.min(touch.clientY, window.innerHeight - 100) + 'px';
  }, 500);
};

window.cancelLongPress = function () {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
};

window.editSelectedMessage = function () {
  document.getElementById('msg-context-menu').style.display = 'none';
  if (!selectedMsgKey) return;

  const msg = firebaseMessages.find(m => m.firebaseKey === selectedMsgKey);
  if (!msg) return;

  const newText = prompt('Edit message:', msg.text);
  if (newText === null || newText.trim() === '') return;

  editFirebaseMessage(selectedMsgKey, newText.trim());
  selectedMsgKey = null;
};

window.deleteSelectedMessage = function () {
  document.getElementById('msg-context-menu').style.display = 'none';
  if (!selectedMsgKey) return;

  if (!confirm('Delete this message?')) { selectedMsgKey = null; return; }

  deleteFirebaseMessage(selectedMsgKey);
  selectedMsgKey = null;
};

// Hide menu on click outside
document.addEventListener('click', () => {
  document.getElementById('msg-context-menu').style.display = 'none';
});

window.deleteAllChats = function () {
  if (!confirm('⚠️ Delete ALL messages from everyone?\nThis cannot be undone!')) return;
  if (!confirm('Are you really sure? This will permanently delete all chat history.')) return;
  deleteAllFirebaseMessages();
};

window.sendAdminMessage = function (e) {
  e.preventDefault();
  const input = document.getElementById('admin-chat-input');
  const text = input.value.trim();
  if (!text) return;

  const session = getSession();
  const admin = getStudentById(session.userId);

  sendFirebaseMessage({
    senderId: session.userId,
    senderName: admin ? admin.name : 'Admin',
    senderRole: 'admin',
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  input.value = '';
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Toggle floating chat panel
window.toggleChat = function () {
  const panel = document.getElementById('chat-panel');
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    sessionStorage.setItem('smt_chat_last_seen', firebaseMessages.length.toString());
    updateChatBadge();
  } else {
    panel.style.display = 'none';
  }
};

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  if (!badge) return;
  const lastSeen = parseInt(sessionStorage.getItem('smt_chat_last_seen') || '0');
  const unread = Math.max(0, firebaseMessages.length - lastSeen);
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// Start listening to Firebase messages (real-time!)
if (typeof listenForMessages === 'function') {
  listenForMessages(renderAdminChatFromMessages);
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  initAdminDashboard();
});

// -- Password Visibility Toggle --
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.pwd-toggle');
  if (!toggle) return;
  const targetId = toggle.getAttribute('data-target');
  const input = document.getElementById(targetId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
});

// Initial badge check
document.addEventListener('DOMContentLoaded', () => { setTimeout(updateChatBadge, 300); });





/* ── Admin Dropdown Logic ── */
window.toggleAdminMenu = function (event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('admin-dropdown-menu');
  const trigger = document.getElementById('admin-menu-trigger');
  
  if (menu) {
    menu.classList.toggle('visible');
    if (trigger) trigger.classList.toggle('active');
  }
};

// Close dropdown on click outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('admin-dropdown-menu');
  const trigger = document.getElementById('admin-menu-trigger');
  if (menu && menu.classList.contains('visible')) {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
      menu.classList.remove('visible');
      if (trigger) trigger.classList.remove('active');
    }
  }
});

/* ── About Developers Logic ── */
window.showDevelopers = function () {
  const modal = document.getElementById('developers-modal');
  if (!modal) return;
  
  // Fetch version from version.json for dynamic display
  fetch('version.json')
    .then(response => response.json())
    .then(data => {
      const versionEl = document.getElementById('dev-modal-version');
      if (versionEl && data.version) {
        versionEl.textContent = data.version;
      }
    })
    .catch(err => console.log('Error fetching version:', err));

  modal.classList.add('visible');
};

window.closeDevelopersModal = function () {
  const modal = document.getElementById('developers-modal');
  if (modal) modal.classList.remove('visible');
};

/* ── Support Logic ── */
window.showSupport = function () {
  const modal = document.getElementById('support-modal');
  if (modal) modal.classList.add('visible');
};

window.closeSupportModal = function () {
  const modal = document.getElementById('support-modal');
  if (modal) modal.classList.remove('visible');
};

window.pushGlobalUpdate = function() {
  if(confirm('⚠️ Are you sure you want to push a global update? This will trigger an update popup for all currently active users.')) {
    firebaseDB.ref('system/app_version').set('v' + Date.now())
      .then(() => alert('✅ Global update triggered!'))
      .catch(e => alert('❌ Error: ' + e));
  }
};
