/* ──────────────────────────────────────────────
   student.js  –  Check-In / Check-Out Logic
   ────────────────────────────────────────────── */

let debounceTimer = null;
let debounceSeconds = 0;
let studentLocation = null; // { lat, lng } or null
let geoCheckDone = false;

document.addEventListener('DOMContentLoaded', () => {
  initCloudSync(() => {
    const session = getSession();
    if (!session || session.role === 'admin') {
      window.location.href = 'index.html';
      return;
    }

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
    avatarEl.innerHTML = `<img src="${student.photo}" alt="${student.name}" class="avatar-img">`;
  }

  const status = getCurrentStatus(student.id);
  const badge = document.getElementById('stu-status');
  badge.textContent = status;
  badge.className = 'status-badge ' + (status === 'IN' ? 'badge-in' : 'badge-out');

  const btnIn = document.getElementById('btn-checkin');
  const btnOut = document.getElementById('btn-checkout');

  // Status Lock
  btnIn.disabled = status === 'IN';
  btnOut.disabled = status === 'OUT';

  // Geofence restriction on check-in
  const geo = getGeofence();
  if (geo && status === 'OUT') {
    // If geofence is set and student is OUT, check-in depends on location
    if (!geoCheckDone) {
      btnIn.disabled = true; // disable until location confirmed
    } else if (studentLocation) {
      const result = checkGeofence(studentLocation.lat, studentLocation.lng);
      if (result && !result.inside) {
        btnIn.disabled = true;
      }
    } else {
      btnIn.disabled = true; // no location available
    }
  }

  btnIn.onclick = () => handleCheckIn(student);
  btnOut.onclick = () => handleCheckOut(student);

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
    return; // no geofence, allow everything
  }

  if (!navigator.geolocation) {
    geoCheckDone = true;
    showLocationBanner('⚠️ GPS not supported on this browser. Check-in restricted.', 'warning');
    return;
  }

  // Security Check: Geolocation requires HTTPS (unless localhost)
  const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isSecure) {
    geoCheckDone = true;
    showLocationBanner('⚠️ <strong>Secure Connection Required:</strong> Geolocation is blocked on non-HTTPS sites. Please use a secure link or contact admin.', 'warning');
    return;
  }

  showLocationBanner('📡 Detecting your precise location...', 'detecting');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      studentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      geoCheckDone = true;
      const result = checkGeofence(studentLocation.lat, studentLocation.lng);

      if (result && result.inside) {
        showLocationBanner(`📍 Inside hostel zone (${result.distance}m from center)`, 'inside');

        // Auto check-in if student is OUT and inside zone
        const status = getCurrentStatus(student.id);
        if (status === 'OUT' && !debounceTimer) {
          autoCheckIn(student);
        }
      } else {
        const dist = result ? result.distance : '?';
        showLocationBanner(`📍 Outside hostel zone (${dist}m away). Check-In disabled.`, 'outside');
      }

      renderStudentUI(student);
    },
    (err) => {
      geoCheckDone = true;
      let msg = '⚠️ Could not detect location. ';
      
      if (err.code === 1) { // PERMISSION_DENIED
        msg += '<strong>Permission denied!</strong> Please enable location access in your browser settings.';
      } else if (err.code === 3) { // TIMEOUT
        msg += '<strong>Request timed out.</strong> Check your network/GPS signal.';
      } else {
        msg += 'Check-In may be restricted.';
      }

      // Add a retry action
      const studentObj = getStudentById(student.id); // ensure fresh copy
      showLocationBanner(`${msg} <button class="btn btn-small" style="margin-left:1rem;background:rgba(255,255,255,0.2);padding:0.2rem 0.5rem;font-size:0.75rem;" onclick="checkStudentLocation(${JSON.stringify(studentObj).replace(/"/g, '&quot;')})">🔄 Retry Discovery</button>`, 'warning');
      
      renderStudentUI(student);
    },
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
  );
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
  addMovement({
    id: generateId(),
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

  const now = new Date().toISOString();
  movs[openIdx].inTime = now;
  saveMovements(movs);
  startDebounce();
  renderStudentUI(student);
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

/* ── Today's History ─────────────────────────── */
function renderTodayHistory(studentId) {
  const tbody = document.getElementById('history-body');
  const movs = getMovementsByDate(todayStr()).filter(m => m.studentId === studentId);
  if (movs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No movements today</td></tr>';
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
        const max = 200;
        if (w > h) { if (w > max) { h = h * max / w; w = max; } }
        else { if (h > max) { w = w * max / h; h = max; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        stuPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
        avatarEl.innerHTML = `<img src="${stuPhotoBase64}" class="detail-photo-img">`;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Save handler
  document.getElementById('profile-form').onsubmit = (e) => {
    e.preventDefault();
    const newId = document.getElementById('profile-stu-id').value.trim();
    const name = document.getElementById('profile-name').value.trim();
    const age = document.getElementById('profile-age').value.trim();
    const dept = document.getElementById('profile-dept').value.trim();
    const year = document.getElementById('profile-year').value;
    const room = document.getElementById('profile-room').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    if (!newId || !name || !room || !phone) return;

    const oldId = student.id;
    const updates = {
      name, age, department: dept, year, room, phone,
      last_updated: new Date().toISOString()
    };
    if (stuPhotoBase64) updates.photo = stuPhotoBase64;

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
        // Update movements
        const movs = getMovements();
        movs.forEach(m => { if (m.studentId === oldId) m.studentId = newId; });
        saveMovements(movs);
        setSession({ userId: newId, role: 'student' });
        student.id = newId;
      }
    } else {
      updateStudent(oldId, updates);
    }

    overlay.classList.remove('visible');
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
           ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()">
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

  const msg = firebaseStudentMessages.find(m => m.firebaseKey === selectedMsgKey);
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
    timestamp: new Date().toISOString()
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
