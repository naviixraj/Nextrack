/* ──────────────────────────────────────────────
   student.js  –  Check-In / Check-Out Logic
   ────────────────────────────────────────────── */

let debounceTimer = null;
let debounceSeconds = 0;
let studentLocation = null; // { lat, lng } or null
let geoCheckDone = false;

// ── IMMEDIATE GPS CHECK (runs before everything, even the startup loader) ──
// This catches GPS-off / permission-denied before the student even sees the UI
(function immediateGPSCheck() {
  if (!navigator.geolocation) return;

  // If we just reloaded after GPS was confirmed (to avoid warm-up loop), skip check
  if (sessionStorage.getItem('gps_just_confirmed')) {
    // We leave it in sessionStorage so startMotionGuard can also see it
    return;
  }

  const showBlockScreen = () => {
    if (document.getElementById('gps-denied-lock')) return;
    const overlay = document.createElement('div');
    overlay.id = 'gps-denied-lock';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999999;
      background: rgba(0,0,0,0.92); backdrop-filter: blur(16px);
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem;
    `;
    overlay.innerHTML = `
      <div id="gps-modal-card" style="
        max-width: 380px; width: 100%;
        background: rgba(20, 10, 10, 0.95);
        border: 2px solid rgba(239,68,68,0.6);
        border-radius: 28px; padding: 2.5rem 2rem; text-align: center;
        box-shadow: 0 0 60px rgba(239,68,68,0.25), 0 30px 60px rgba(0,0,0,0.6);
        font-family: 'Inter', sans-serif; color: white;
      ">
        <div id="gps-icon-wrap" style="
          width: 72px; height: 72px; border-radius: 20px; margin: 0 auto 1.5rem;
          background: rgba(239,68,68,0.15); border: 2px solid rgba(239,68,68,0.4);
          display: flex; align-items: center; justify-content: center;
          font-size: 2.2rem; box-shadow: 0 8px 25px rgba(239,68,68,0.3);
          animation: gps-pulse 2s ease-in-out infinite;
        ">🚫</div>
        <h2 id="gps-title" style="font-size:1.4rem; font-weight:800; color:#ef4444; margin-bottom:0.8rem;">Location Required</h2>
        <p id="gps-desc" style="font-size:0.92rem; color:rgba(255,255,255,0.75); line-height:1.6; margin-bottom:0.8rem;">
          Location access is <strong style="color:#fff;">MANDATORY</strong> for NexTrack attendance.<br>The warden has been notified.
        </p>
        <p id="gps-sub" style="font-size:0.78rem; color:rgba(255,255,255,0.45); margin-bottom:2rem;">
          Enable GPS in your phone settings — this page will unlock automatically.
        </p>
        <button id="gps-retry-btn" class="btn-primary" style="width: 100%; padding: 0.8rem; font-size: 0.95rem; margin-bottom: 0.5rem; border-radius: 12px !important;" onclick="this.textContent='Checking...'; this.style.opacity='0.7'; setTimeout(() => window.location.reload(), 100);">Try Again</button>
        <p id="gps-error-msg" style="color: #fca5a5; font-size: 0.8rem; margin-top: 0.5rem; display: none;">Location is still off or denied.</p>
      </div>
      <style>
        @keyframes gps-pulse { 0%,100%{box-shadow:0 8px 25px rgba(239,68,68,0.3)} 50%{box-shadow:0 8px 40px rgba(239,68,68,0.6)} }
      </style>
    `;
    // Force body overflow hidden
    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);
  };

  // Step 1: Check Permissions API instantly
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'denied') { showBlockScreen(); return; }
      // Step 2: Try actual GPS with short timeout
      navigator.geolocation.getCurrentPosition(
        () => {}, // Success — do nothing, main flow handles it
        (err) => { if (err.code === 1 || err.code === 2) showBlockScreen(); }, // Block on Denied or Unavailable
        { enableHighAccuracy: false, maximumAge: 0, timeout: 5000 }
      );
      result.onchange = () => { if (result.state === 'denied') showBlockScreen(); };
    }).catch(() => {
      // Permissions API not available — just try GPS directly
      navigator.geolocation.getCurrentPosition(
        () => {},
        (err) => { if (err.code === 1 || err.code === 2) showBlockScreen(); },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 5000 }
      );
    });
  } else {
    navigator.geolocation.getCurrentPosition(
      () => {},
      (err) => { if (err.code === 1 || err.code === 2) showBlockScreen(); },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 5000 }
    );
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  document.body.style.overflow = 'hidden'; // Lock scroll during startup

  const loader = document.getElementById('startup-loader');
  const msgEl = document.getElementById('startup-msg');
  const messages = [
    "Connecting to Titans Server...",
    "Secure Portal Authentication...",
    "Syncing Student Profile...",
    "NexTrack | Titans Precision",
    "Welcome. — Provided by Team Titans"
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
    if (!session || session.role === 'admin') {
      window.location.href = 'index.html';
      return;
    }

    try {
      const student = getStudentById(session.userId);
      if (!student) {
        clearSession();
        window.location.href = 'index.html';
        return;
      }

      // ── 90-Day Rule ──
      const daysSinceUpdate = Math.floor((Date.now() - new Date(student.last_updated).getTime()) / 86400000);
      if (daysSinceUpdate > 90) {
        showProfileModal(student, true);
      }

      initHistoryFilters();
      renderStudentUI(student);

      // ── Geolocation Check ──
      checkStudentLocation(student);

      // The Magic: Live UI updates via Cloud Sync
      window.addEventListener('db_updated', () => {
        const liveStudent = getStudentById(session.userId);
        if (!liveStudent) {
          // Admin deleted you!
          clearSession();
          window.location.href = 'index.html';
        } else {
          renderStudentUI(liveStudent);
        }
      });
    } catch (err) {
      console.error("🚨 Student Hub Sync Error:", err);
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

function renderStudentUI(student) {
  // Re-fetch student to get latest data (e.g. edit alerts from admin)
  const freshStudent = getStudentById(student.id);
  if (freshStudent) Object.assign(student, freshStudent);

  // Show admin edit alert if any
  let alertBanner = document.getElementById('admin-edit-banner');
  if (student.editAlert) {
    if (!alertBanner) {
      alertBanner = document.createElement('div');
      alertBanner.id = 'admin-edit-banner';
      const main = document.querySelector('.stu-main');
      main.insertBefore(alertBanner, main.firstChild);
    }
    if (student.editAlert === 'warning') {
      alertBanner.className = 'geo-banner geo-outside';
      alertBanner.textContent = student.editAlertMsg || '⚠️ Unauthorized access attempt detected on your profile.';
    } else if (student.editAlert === 'editing') {
      alertBanner.className = 'geo-banner geo-detecting';
      alertBanner.textContent = student.editAlertMsg || '🔒 Your account is currently under editing by an admin.';
    }
    alertBanner.style.display = 'block';
  } else if (alertBanner) {
    alertBanner.style.display = 'none';
  }

  document.getElementById('stu-name').textContent = student.name;
  document.getElementById('stu-id').textContent = student.id;
  document.getElementById('stu-room').textContent = student.room;

  const avatarEl = document.getElementById('stu-avatar');
  if (student.photo) {
    avatarEl.innerHTML = `<img src="${student.photo}" alt="${escapeHtmlStu(student.name)}" class="avatar-img">`;
  }

  const status = getCurrentStatus(student.id);
  const badge = document.getElementById('stu-status');
  badge.textContent = status;
  badge.className = 'status-badge ' + (status === 'IN' ? 'badge-in' : 'badge-out');

  // Update live status banner above profile
  const liveLabel = document.getElementById('stu-live-status');
  if (liveLabel) {
    if (status === 'IN') {
      liveLabel.textContent = 'Currently Inside';
      liveLabel.className = 'live-status-label status-in';
    } else {
      liveLabel.textContent = 'Currently Outside';
      liveLabel.className = 'live-status-label status-out';
    }
  }

  const btnIn = document.getElementById('btn-checkin');
  const btnOut = document.getElementById('btn-checkout');

  // 🔒 FULL AUTOMATION: Buttons are for status display only
  btnIn.disabled = true;
  btnOut.disabled = true;
  btnIn.onclick = null;
  btnOut.onclick = null;
  
  // Update button text to reflect automation
  if (status === 'IN') {
    btnIn.innerHTML = '<span>✅ Inside Hostel (Auto)</span>';
    btnOut.innerHTML = '<span>🤖 Guarding Activity...</span>';
  } else {
    btnIn.innerHTML = '<span>🤖 Guarding Activity...</span>';
    btnOut.innerHTML = '<span>🚶 Checked Out (Auto)</span>';
  }

  // restore debounce if active
  if (debounceTimer) {
    btnIn.disabled = true;
    btnOut.disabled = true;
  }

  renderTodayHistory(student.id);
  updateLocationBanner();
}

/* ── Geolocation Check ───────────────────────── */
function checkStudentLocation(student) {
  const geo = getGeofence();
  if (!geo) {
    geoCheckDone = true;
    updateLocationBanner();
    return;
  }

  if (!navigator.geolocation) {
    geoCheckDone = true;
    showLocationBanner('⚠️ GPS not supported on this browser.', 'warning');
    return;
  }

  // Security Check: Geolocation requires HTTPS (unless localhost)
  const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isSecure) {
    geoCheckDone = true;
    showLocationBanner('⚠️ <strong>Secure Connection Required:</strong> Geolocation is blocked on non-HTTPS sites.', 'warning');
    return;
  }

  // ── Smart Motion Guard Initialization ──
  startMotionGuard(student);
}

function autoCheckIn(student) {
  const movs = getMovements();
  const openIdx = movs.findLastIndex(m => m.studentId === student.id && !m.inTime);
  if (openIdx === -1) return;

  const now = new Date().toISOString();
  movs[openIdx].inTime = now;
  saveMovements(movs);

  showLocationBanner('✅ Auto-checked-in! You are inside the hostel zone.', 'auto-checkin');
  renderStudentUI(student);
}

function showPremiumLocationModal(title, message, isPermission, student) {
  if (document.getElementById('location-error-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'location-error-modal';
  overlay.className = 'update-overlay'; // Reusing the premium overlay styles
  overlay.innerHTML = `
    <div class="update-modal location-modal-box">
      <div class="update-icon" style="background:rgba(248,113,113,0.2);color:#f87171;box-shadow:0 8px 25px rgba(248,113,113,0.3);">⚠️</div>
      <h2 class="update-title">${title}</h2>
      <p class="update-desc">${message}</p>
      <div style="display:flex; flex-direction:column; gap:0.8rem;">
        <button class="update-btn" style="background:#f87171;" onclick="location.reload()">🔄 Refresh App</button>
        <button class="btn btn-ghost btn-small" onclick="document.getElementById('location-error-modal').remove()" style="opacity:0.6; font-size:0.75rem;">Dismiss</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('visible'), 100);
}

function showLocationBanner(text, type) {
  let banner = document.getElementById('geo-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'geo-banner';
    const main = document.querySelector('.stu-main');
    if (main) main.insertBefore(banner, main.firstChild);
    else return;
  }
  
  // Use icons based on type
  let icon = '📍';
  if (type === 'inside') icon = '🏠';
  if (type === 'outside') icon = '🚶';
  if (type === 'warning' || type === 'error') icon = '⚠️';
  if (type === 'auto-checkin') icon = '✅';

  banner.innerHTML = `<span style="margin-right:0.6rem;">${icon}</span> ${text}`; 
  banner.className = 'geo-banner geo-' + type;
  banner.style.display = 'block';
}

function updateLocationBanner() {
  const geo = getGeofence();
  if (!geo) {
    const banner = document.getElementById('geo-banner');
    if (banner) banner.style.display = 'none';
  }
}

function getCurrentStatus(studentId) {
  const movs = getMovements().filter(m => m.studentId === studentId);
  if (movs.length === 0) return 'IN';
  const latest = movs[movs.length - 1];
  return latest.inTime ? 'IN' : 'OUT';
}

/* ── Check-Out ───────────────────────────────── */
function handleCheckOut(student) {
  const now = new Date().toISOString();
  const movId = (typeof firebaseDB !== 'undefined' && firebaseDB) 
                ? firebaseDB.ref('movements').push().key 
                : generateId();
  addMovement({
    id: movId,
    studentId: student.id,
    outTime: now,
    inTime: null,
    date: todayStr(),
  });
  startDebounce();
  renderStudentUI(student);
}

/* ── Check-In (Row-Match Rule) ───────────────── */
function handleCheckIn(student) {
  const movs = getMovements();
  // Find the open movement (same student, no inTime)
  const openIdx = movs.findLastIndex(m => m.studentId === student.id && !m.inTime);
  if (openIdx === -1) return; // safety

  const openMov = movs[openIdx];
  const now = new Date().toISOString();
  updateMovement(openMov.id, { inTime: now }).then(() => {
    startDebounce();
    renderStudentUI(student);
  });
}

/* ── 60-Second Debounce Timer ────────────────── */
function startDebounce() {
  const btnIn = document.getElementById('btn-checkin');
  const btnOut = document.getElementById('btn-checkout');
  const timerEl = document.getElementById('debounce-timer');

  btnIn.disabled = true;
  btnOut.disabled = true;
  debounceSeconds = 60;

  timerEl.textContent = `Please wait ${debounceSeconds}s...`;
  timerEl.style.display = 'block';

  debounceTimer = setInterval(() => {
    debounceSeconds--;
    timerEl.textContent = `Please wait ${debounceSeconds}s...`;
    if (debounceSeconds <= 0) {
      clearInterval(debounceTimer);
      debounceTimer = null;
      timerEl.style.display = 'none';
      const session = getSession();
      if (session) {
        const stu = getStudentById(session.userId);
        if (stu) renderStudentUI(stu);
      }
    }
  }, 1000);
}

/* ── History Filtering & Rendering ───────────────────────── */
let currentStuHistoryDate = todayStr();

function renderHistory(studentId) {
  const tbody = document.getElementById('history-body');
  const movs = getMovementsByDate(currentStuHistoryDate).filter(m => m.studentId === studentId);
  
  if (movs.length === 0) {
    let emptyMsg = (currentStuHistoryDate === todayStr()) ? "No movements today" : `No movements on ${currentStuHistoryDate}`;
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">${emptyMsg}</td></tr>`;
    return;
  }
  tbody.innerHTML = movs.map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${formatTime(m.outTime)}</td>
      <td>${formatTime(m.inTime)}</td>
      <td>${calcDuration(m.outTime, m.inTime)}</td>
    </tr>
  `).join('');
}

function initHistoryFilters() {
  const btnToday = document.getElementById('stu-filter-today');
  const btnYest = document.getElementById('stu-filter-yesterday');
  const customDateInput = document.getElementById('stu-filter-custom-date');
  const customBtn = document.getElementById('stu-filter-custom-btn');
  const dateLabel = document.getElementById('stu-table-date-label');

  function updateActiveBtn(activeBtn) {
    [btnToday, btnYest, customBtn].forEach(b => {
      if(b) b.classList.remove('active');
    });
    if(activeBtn) activeBtn.classList.add('active');
  }

  function applyDate(dateStr, btnToActivate) {
    currentStuHistoryDate = dateStr;
    updateActiveBtn(btnToActivate);
    
    if (dateStr === todayStr()) dateLabel.textContent = 'Showing: Today';
    else if (dateStr === yesterdayStr()) dateLabel.textContent = 'Showing: Yesterday';
    else dateLabel.textContent = 'Showing: ' + dateStr;

    const session = getSession();
    if(session) renderHistory(session.userId);
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      customDateInput.value = '';
      applyDate(todayStr(), btnToday);
    });
  }
  
  if (btnYest) {
    btnYest.addEventListener('click', () => {
      customDateInput.value = '';
      applyDate(yesterdayStr(), btnYest);
    });
  }

  if (customBtn) {
    customBtn.addEventListener('click', () => {
      const d = customDateInput.value;
      if (d) applyDate(d, customBtn);
    });
  }

  // Initialize label
  if(dateLabel) dateLabel.textContent = 'Showing: Today';
}

/* ── Profile Update Modal ────────────────────── */
let stuPhotoBase64 = '';

function showProfileModal(student, forced = false) {
  const overlay = document.getElementById('profile-modal');
  overlay.classList.add('visible');

  if (forced) {
    document.getElementById('modal-forced-msg').style.display = 'block';
    document.getElementById('modal-close-btn').style.display = 'none';
    document.getElementById('modal-cancel-btn').style.display = 'none';
  } else {
    document.getElementById('modal-forced-msg').style.display = 'none';
    document.getElementById('modal-close-btn').style.display = '';
    document.getElementById('modal-cancel-btn').style.display = '';
  }

  // Populate fields
  stuPhotoBase64 = student.photo || '';
  const avatarEl = document.getElementById('profile-avatar');
  if (student.photo) {
    avatarEl.innerHTML = `<img src="${student.photo}" class="detail-photo-img">`;
  } else {
    avatarEl.innerHTML = '<span class="detail-photo-placeholder">👤</span>';
  }

  document.getElementById('profile-stu-id').value = student.id || '';
  document.getElementById('profile-name').value = student.name || '';
  document.getElementById('profile-age').value = student.age || '';
  document.getElementById('profile-dept').value = student.department || '';
  document.getElementById('profile-year').value = student.year || '';
  document.getElementById('profile-room').value = student.room || '';
  document.getElementById('profile-phone').value = student.phone || '';
  document.getElementById('profile-email').value = student.email || '';
 
  // Reset password fields in UI
  document.getElementById('profile-old-pwd').value = '';
  document.getElementById('profile-new-pwd').value = '';
  document.getElementById('profile-confirm-pwd').value = '';
  const pwdMsg = document.getElementById('profile-pwd-msg');
  pwdMsg.style.display = 'none';
  pwdMsg.textContent = '';

  // Photo upload handler
  const photoInput = document.getElementById('profile-photo-input');
  photoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const max = 120;
        if (w > h) { if (w > max) { h = h * max / w; w = max; } }
        else { if (h > max) { w = w * max / h; h = max; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        stuPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
        avatarEl.innerHTML = `<img src="${stuPhotoBase64}" class="detail-photo-img">`;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Save handler
  document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const newId = document.getElementById('profile-stu-id').value.trim();
    const name = document.getElementById('profile-name').value.trim();
    const age = document.getElementById('profile-age').value.trim();
    const dept = document.getElementById('profile-dept').value.trim();
    const year = document.getElementById('profile-year').value;
    const room = document.getElementById('profile-room').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    const email = document.getElementById('profile-email').value.trim();
 
    if (!newId || !name || !room || !phone || !email) return;
 
    // Manual Password Change Logic
    const oldPwd = document.getElementById('profile-old-pwd').value;
    const newPwd = document.getElementById('profile-new-pwd').value;
    const confirmPwd = document.getElementById('profile-confirm-pwd').value;
    const pwdMsg = document.getElementById('profile-pwd-msg');
 
    let passwordToSave = student.password;
 
    if (oldPwd || newPwd || confirmPwd) {
      const hashedOldPwd = await hashPassword(oldPwd);
      if (hashedOldPwd !== student.password) {
        pwdMsg.textContent = '❌ Old password is incorrect.';
        pwdMsg.style.display = 'block';
        return;
      }
      if (newPwd.length < 4) {
        pwdMsg.textContent = '⚠️ New password must be at least 4 characters.';
        pwdMsg.style.display = 'block';
        return;
      }
      if (newPwd !== confirmPwd) {
        pwdMsg.textContent = '⚠️ New passwords do not match.';
        pwdMsg.style.display = 'block';
        return;
      }
      passwordToSave = await hashPassword(newPwd);
    }
 
    const oldId = student.id;
    const updates = {
      name, email, age, department: dept, year, room, phone,
      password: passwordToSave,
      photo: stuPhotoBase64,
      last_updated: new Date().toISOString()
    };
 
    if (newId !== oldId) {
      const students = getStudents();
      const existing = students.find(s => s.id === newId);
      if (existing) { 
        pwdMsg.textContent = '⚠️ That Registration No. is already taken.';
        pwdMsg.style.display = 'block';
        return; 
      }
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
        setSession({ userId: newId, role: 'student' });
        student.id = newId;
      }
    } else {
      updateStudent(oldId, updates);
    }
 
    overlay.classList.remove('visible');
    // Important: Update the local student object with the new updates
    Object.assign(student, updates);
    renderStudentUI(student);
  };
}

// Expose for HTML onclick
window.openProfileModal = () => {
  const session = getSession();
  if (session) {
    const stu = getStudentById(session.userId);
    if (stu) showProfileModal(stu, false);
  }
};

// Logout
window.logout = () => {
  if (confirm('🚪 Are you sure you want to logout?')) {
    clearSession();
    window.location.href = 'index.html';
  }
};

/* ── Student Dropdown Logic ── */
window.toggleStudentMenu = function (event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('student-dropdown-menu');
  const trigger = document.getElementById('student-menu-trigger');
  
  if (menu) {
    menu.classList.toggle('visible');
    if (trigger) trigger.classList.toggle('active');
  }
};

// Close dropdown on click outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('student-dropdown-menu');
  const trigger = document.getElementById('student-menu-trigger');
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

/* ═══════════════════════════════════════════════
   CHAT SYSTEM (Student Side — Firebase)
   ═══════════════════════════════════════════════ */
let firebaseStudentMessages = [];
let selectedMsgKey = null;
let longPressTimer = null;

function renderStudentChatFromMessages(msgs) {
  const container = document.getElementById('student-chat-messages');
  if (!container) return;
  const session = getSession();

  firebaseStudentMessages = msgs;

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
           ontouchend="cancelLongPress(event)" ontouchmove="cancelLongPress(event)">
        ${!isMine ? `<span class="chat-sender">${escapeHtmlStu(m.senderName)}${isAdminMsg ? ' 🛡️' : ''}</span>` : ''}
        <span>${escapeHtmlStu(m.text)}${editedTag}</span>
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
  if (senderId !== session.userId) return;

  selectedMsgKey = key;
  const menu = document.getElementById('msg-context-menu');
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 150) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
};

let isLongPressTriggered = false;

window.startLongPress = function (e, key, senderId) {
  const session = getSession();
  if (senderId !== session.userId) return;

  isLongPressTriggered = false;
  longPressTimer = setTimeout(() => {
    isLongPressTriggered = true;
    selectedMsgKey = key;
    const touch = e.touches[0];
    const menu = document.getElementById('msg-context-menu');
    menu.style.display = 'block';
    menu.style.left = Math.min(touch.clientX, window.innerWidth - 150) + 'px';
    menu.style.top = Math.min(touch.clientY, window.innerHeight - 100) + 'px';
  }, 500);
};

window.cancelLongPress = function (e) {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  
  // If long press actually triggered the menu, prevent the synthesized click on touch release!
  if (isLongPressTriggered && e && e.type === 'touchend') {
    e.preventDefault();
  }
};

window.editSelectedMessage = function (e) {
  if(e) e.stopPropagation();
  document.getElementById('msg-context-menu').style.display = 'none';
  if (!selectedMsgKey) return;

  const msg = firebaseStudentMessages.find(m => m.firebaseKey === selectedMsgKey);
  if (!msg) return;

  const newText = prompt('Edit message:', msg.text);
  if (newText === null || newText.trim() === '') return;

  editFirebaseMessage(selectedMsgKey, newText.trim());
  selectedMsgKey = null;
};

window.deleteSelectedMessage = function (e) {
  if(e) e.stopPropagation();
  document.getElementById('msg-context-menu').style.display = 'none';
  if (!selectedMsgKey) return;

  if (!confirm('Delete this message?')) { selectedMsgKey = null; return; }

  deleteFirebaseMessage(selectedMsgKey);
  selectedMsgKey = null;
};

// Hide menu on click outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('msg-context-menu');
  if (menu && menu.style.display === 'block') {
    menu.style.display = 'none';
  }
});

window.sendStudentMessage = function (e) {
  e.preventDefault();
  const input = document.getElementById('student-chat-input');
  const text = input.value.trim();
  if (!text) return;

  const session = getSession();
  const student = getStudentById(session.userId);

  sendFirebaseMessage({
    senderId: session.userId,
    senderName: student ? student.name : 'Student',
    senderRole: 'student',
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  input.value = '';
};

function escapeHtmlStu(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Toggle floating chat panel
window.toggleChat = function () {
  const panel = document.getElementById('chat-panel');
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    sessionStorage.setItem('smt_chat_last_seen', firebaseStudentMessages.length.toString());
    updateChatBadge();
  } else {
    panel.style.display = 'none';
  }
};

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  if (!badge) return;
  const lastSeen = parseInt(sessionStorage.getItem('smt_chat_last_seen') || '0');
  const unread = Math.max(0, firebaseStudentMessages.length - lastSeen);
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// Start listening to Firebase messages (real-time!)
if (typeof listenForMessages === 'function') {
  listenForMessages(renderStudentChatFromMessages);
}

// Initial badge check
document.addEventListener('DOMContentLoaded', () => { setTimeout(updateChatBadge, 300); });
/* ── Smart Motion Guard (Geofencing) ── */
let motionWatcher = null;

function startMotionGuard(student) {
  const geo = getGeofence();
  if (!geo || !navigator.geolocation) {
    geoCheckDone = true;
    updateLocationBanner();
    return;
  }

  // Refined message to clearly indicate detection is in progress
  showLocationBanner('📡 Detecting Location Signal...', 'detecting');

  if (motionWatcher) navigator.geolocation.clearWatch(motionWatcher);

  // ── Success Handler (Shared) ──
  const onLocationSuccess = (pos) => {
    if (window.code2GraceTimer) {
      clearTimeout(window.code2GraceTimer);
      window.code2GraceTimer = null;
    }
    // Ignore inaccurate location fixes (e.g. cellular triangulation indoors) to avoid false check-outs
    if (pos.coords.accuracy > 150) {
      console.warn(`📡 Ignoring inaccurate location: ±${Math.round(pos.coords.accuracy)}m`);
      showLocationBanner(`⚠️ Weak GPS Accuracy (±${Math.round(pos.coords.accuracy)}m). Optimizing...`, 'warning');
      return;
    }

    console.log(`📍 Location Sync: ${pos.coords.latitude}, ${pos.coords.longitude} (±${Math.round(pos.coords.accuracy)}m)`);
    studentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    geoCheckDone = true;
    
    // NOTE: Removed continuous updateStudent location_status ping to preserve database storage and bandwidth

    const result = checkGeofence(studentLocation.lat, studentLocation.lng);
    const status = getCurrentStatus(student.id);

    if (result) {
      const geo = getGeofence();
      const checkInRadius = geo.radius;
      const checkOutRadius = geo.radius + 50; // Hysteresis: add 50m to check-out

      if (result.distance <= checkInRadius) {
        showLocationBanner(`📍 Inside hostel zone`, 'inside');
        if (status === 'OUT' && !debounceTimer) {
          handleCheckIn(student); // Auto check-in
        }
      } else if (result.distance >= checkOutRadius) {
        showLocationBanner(`🚶 Outside hostel`, 'outside');
        if (status === 'IN' && !debounceTimer) {
          handleCheckOut(student); // Auto check-out
        }
      }
    }
  };

  // ── Error Handler for Continuous Watch (after page loaded) ──
  const onLocationError = (err) => {
    geoCheckDone = true;
    console.warn(`🛑 GPS Watch Error (${err.code}): ${err.message}`);
    if (err.code === 1) { // Permission Denied
      showPermissionDeniedModal(student);
      updateStudent(student.id, {
        location_status: 'REFUSED',
        last_security_check: new Date().toISOString()
      }).catch(e => console.error('DB sync failed:', e));
    } else if (err.code === 2) { // Position Unavailable (e.g., inside elevator)
      showLocationBanner('⚠️ GPS Signal Weak. Move to open area.', 'warning');
      if (!window.code2GraceTimer) {
        window.code2GraceTimer = setTimeout(() => {
          showPermissionDeniedModal(student);
          updateStudent(student.id, {
            location_status: 'REFUSED',
            last_security_check: new Date().toISOString()
          }).catch(e => console.error('DB sync failed:', e));
        }, 30000); // 30 second grace period
      }
    } else { // Timeout or unknown
      showLocationBanner('⚠️ GPS Signal Weak. Move to open area.', 'warning');
    }
  };

  // ── Error Handler for Initial Check (STRICT but ignoring timeout) ──
  const onInitialCheckError = (err) => {
    console.warn(`🚫 Initial GPS Check Failed (${err.code}): ${err.message}`);
    if (err.code === 1) { // Permission Denied
      showPermissionDeniedModal(student);
      updateStudent(student.id, {
        location_status: 'REFUSED',
        last_security_check: new Date().toISOString()
      }).catch(e => console.error('DB sync failed:', e));
    } else if (err.code === 2) { // Position Unavailable
      showLocationBanner('📡 GPS Signal Weak. Searching...', 'warning');
      startContinuousWatch();
      if (!window.code2GraceTimer) {
        window.code2GraceTimer = setTimeout(() => {
          showPermissionDeniedModal(student);
          updateStudent(student.id, {
            location_status: 'REFUSED',
            last_security_check: new Date().toISOString()
          }).catch(e => console.error('DB sync failed:', e));
        }, 30000); // 30 second grace period
      }
    } else {
      showLocationBanner('📡 GPS Signal Weak. Searching...', 'warning');
      startContinuousWatch(); // Keep trying instead of blocking
    }
  };

  // ── INSTANT CHECK: Use Permissions API first (zero delay) ──
  const runGeoCheck = () => {
    // If we just unlocked the screen, GPS is warming up. Go straight to continuous watch.
    if (sessionStorage.getItem('gps_just_confirmed')) {
      sessionStorage.removeItem('gps_just_confirmed'); // Consume the flag
      startContinuousWatch();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocationSuccess(pos);
        startContinuousWatch();
      },
      onInitialCheckError, // ANY failure on initial check = show lock screen
      { enableHighAccuracy: false, maximumAge: 0, timeout: 5000 }
    );
  };

  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'denied') {
        // INSTANT — browser already denied, no GPS call needed
        onInitialCheckError({ code: 1, message: 'Permission denied by browser settings' });
        return;
      }
      runGeoCheck();
      // Watch for mid-session permission revocation
      result.onchange = () => {
        if (result.state === 'denied') {
          onInitialCheckError({ code: 1, message: 'Permission revoked mid-session' });
        }
      };
    }).catch(() => runGeoCheck());
  } else {
    runGeoCheck();
  }

  function startContinuousWatch() {
    if (motionWatcher) navigator.geolocation.clearWatch(motionWatcher);
    motionWatcher = navigator.geolocation.watchPosition(
      onLocationSuccess,
      onLocationError, // lenient — code 3 = just weak signal
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }
}

function showPermissionDeniedModal(student) {
  if (document.getElementById('gps-denied-lock')) return;

  const overlay = document.createElement('div');
  overlay.id = 'gps-denied-lock';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 10000000;
    background: rgba(0,0,0,0.85); backdrop-filter: blur(16px);
    display: flex; align-items: center; justify-content: center;
    padding: 1.5rem; opacity: 0; visibility: hidden;
    transition: opacity 0.5s ease, visibility 0.5s ease;
  `;

  overlay.innerHTML = `
    <div id="gps-modal-card" style="
      max-width: 380px; width: 100%;
      background: rgba(20, 10, 10, 0.9);
      border: 2px solid rgba(239,68,68,0.6);
      border-radius: 28px; padding: 2.5rem 2rem; text-align: center;
      box-shadow: 0 0 60px rgba(239,68,68,0.25), 0 30px 60px rgba(0,0,0,0.6);
      transform: scale(0.9) translateY(20px);
      transition: all 0.6s cubic-bezier(0.19, 1, 0.22, 1);
      font-family: 'Inter', sans-serif; color: white;
    ">
      <div id="gps-icon-wrap" style="
        width: 72px; height: 72px; border-radius: 20px; margin: 0 auto 1.5rem;
        background: rgba(239,68,68,0.15); border: 2px solid rgba(239,68,68,0.4);
        display: flex; align-items: center; justify-content: center;
        font-size: 2.2rem;
        box-shadow: 0 8px 25px rgba(239,68,68,0.3);
        animation: gps-pulse 2s ease-in-out infinite;
      ">🚫</div>
      <h2 id="gps-title" style="font-size:1.4rem; font-weight:800; color:#ef4444; margin-bottom:0.8rem;">Location Required</h2>
      <p id="gps-desc" style="font-size:0.92rem; color:rgba(255,255,255,0.7); line-height:1.6; margin-bottom:0.8rem;">
        Location access is <strong style="color:#fff;">MANDATORY</strong> for NexTrack attendance.<br>The warden has been notified.
      </p>
      <p id="gps-sub" style="font-size:0.78rem; color:rgba(255,255,255,0.45); margin-bottom:2rem;">
        Enable GPS in your phone settings, then tap Try Again to unlock.
      </p>
      <button id="gps-retry-btn" class="btn-primary" style="width: 100%; padding: 0.8rem; font-size: 0.95rem; margin-bottom: 0.5rem; border-radius: 12px !important;" onclick="this.textContent='Checking...'; this.style.opacity='0.7'; setTimeout(() => window.location.reload(), 100);">Try Again</button>
      <p id="gps-error-msg" style="color: #fca5a5; font-size: 0.8rem; margin-top: 0.5rem; display: none;">Location is still off or denied.</p>
    </div>
    <style>
      @keyframes gps-pulse {
        0%, 100% { box-shadow: 0 8px 25px rgba(239,68,68,0.3); }
        50% { box-shadow: 0 8px 40px rgba(239,68,68,0.6); }
      }
    </style>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Animate in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.style.visibility = 'visible';
    setTimeout(() => {
      const card = document.getElementById('gps-modal-card');
      if (card) card.style.transform = 'scale(1) translateY(0)';
    }, 50);
  });
}


// -- Password Visibility Toggle --
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.pwd-toggle');
  if (!toggle) return;
  const targetId = toggle.getAttribute('data-target');
  const input = document.getElementById(targetId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
});
