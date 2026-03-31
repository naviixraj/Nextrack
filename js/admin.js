/* ──────────────────────────────────────────────
   admin.js  –  Dashboard, Monitoring, Management
   ────────────────────────────────────────────── */

let currentDateFilter = 'today';
let customDate = '';
let curfewInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  const session = getSession();
  if (!session || session.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

  initDashboard();
  initTabs();
  startCurfewCheck();
});

/* ═══════════════════════════════════════════════
   DASHBOARD – Status Cards
   ═══════════════════════════════════════════════ */
function initDashboard() {
  renderCards();
  renderMonitoringTable();
  renderDirectory();
  trackAdminLogin();
  renderAdminList();
  initGeofenceUI();
}

function renderCards() {
  const students = getStudents().filter(s => s.role !== 'admin');
  const movements = getMovements();
  const total = students.length;

  // A student is "outside" if their latest movement has no inTime
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

  // 7:01 PM Trigger
  const outsideCard = document.getElementById('outside-card');
  if (isNowPastCurfew() && outsideCount > 0) {
    outsideCard.classList.add('blink-alert');
  } else {
    outsideCard.classList.remove('blink-alert');
  }
}

window.showOutsideStudents = function () {
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
    container.innerHTML = '<p class="empty-row">All students are inside. 🎉</p>';
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
      document.getElementById(tab.dataset.panel).classList.add('active');
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

  const movements = getMovementsByDate(dateStr);
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
  const students = getStudents().filter(s => s.role !== 'admin');
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
  document.getElementById('detail-edit-room').onclick = () => { closeStudentModal(); editRoom(s.id); };

  // Hide reset pwd button for students
  document.getElementById('detail-reset-pwd').style.display = 'none';

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
   STUDENT HISTORY SEARCH
   ═══════════════════════════════════════════════ */
window.searchStudentHistory = function () {
  const query = document.getElementById('history-search').value.trim().toLowerCase();
  const container = document.getElementById('history-search-results');

  if (!query) {
    container.innerHTML = '';
    return;
  }

  const students = getStudents().filter(s => s.role !== 'admin');
  const matches = students.filter(s =>
    s.id.toLowerCase().includes(query) ||
    s.name.toLowerCase().includes(query) ||
    s.room.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    container.innerHTML = '<p class="empty-row">No matching students found.</p>';
    return;
  }

  container.innerHTML = matches.map(s => {
    const photo = s.photo ? `<img src="${s.photo}" class="table-avatar">` : '<span class="table-avatar-placeholder">👤</span>';
    const movements = getMovements().filter(m => m.studentId === s.id);

    // Current status
    let status = 'IN';
    if (movements.length > 0 && !movements[movements.length - 1].inTime) status = 'OUT';

    let historyHTML = '';
    if (movements.length === 0) {
      historyHTML = '<p class="empty-row" style="margin:0.5rem 0;">No movement history.</p>';
    } else {
      // Show latest first
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
            <strong>${s.name}</strong>
            <span class="recovery-meta">${s.id} · Room ${s.room} · ${s.department || ''} · ${s.year || ''}</span>
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
        <strong>${s.name}</strong>
        <span class="recovery-meta">${s.id} · Room ${s.room} · ${s.phone}</span>
      </div>
      <div class="recovery-actions">
        <button class="btn btn-small btn-accent" onclick="editRoom('${s.id}')">Edit Room</button>
      </div>
    </div>
  `).join('');
};

window.resetPassword = function (id) {
  const newPwd = prompt('Enter new password for ' + id + ':');
  if (newPwd && newPwd.length >= 4) {
    updateStudent(id, { password: newPwd });
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

/* ── Refresh dashboard ───────────────────────── */
window.refreshDashboard = function () {
  renderCards();
  renderMonitoringTable();
  renderDirectory();
  renderAdminList();
};

/* ═══════════════════════════════════════════════
   GEOFENCE SETTINGS
   ═══════════════════════════════════════════════ */
function initGeofenceUI() {
  const geo = getGeofence();
  const status = document.getElementById('geo-status');
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
  localStorage.removeItem('smt_geofence');
  document.getElementById('geo-lat').value = '';
  document.getElementById('geo-lng').value = '';
  document.getElementById('geo-radius').value = '';
  document.getElementById('geo-status').innerHTML = '<span style="color:var(--text-muted);">Geofence removed. Check-in allowed from anywhere.</span>';
  alert('🗑 Geofence removed.');
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
      status.innerHTML = `<span style="color:#f87171;">❌ Location error: ${err.message}. Please enter coordinates manually.</span>`;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};
