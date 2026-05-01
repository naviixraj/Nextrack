/* ──────────────────────────────────────────────
   student.js  –  Check-In / Check-Out Logic
   ────────────────────────────────────────────── */

let qrInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  const loader = document.getElementById('startup-loader');
  const msgEl = document.getElementById('startup-msg');
  const messages = ["Connecting to Titans Server...", "Secure Portal Authentication...", "Syncing Student Profile...", "NexTrack | Titans Precision", "Welcome. — Provided by Team Titans"];
  
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

  const session = getSession();
  if (!session || session.role === 'admin') {
    window.location.href = 'index.html';
    return;
  }

  // Initialize SaaS Sync
  initCollegeSync(session.collegeId, () => {
    const student = getStudentById(session.userId);
    if (!student) {
      clearSession();
      window.location.href = 'index.html';
      return;
    }

    renderStudentUI(student);
    initButtons(student);

    // ── 90-Day Rule ──
    let daysSinceUpdate = 999; // Default to trigger if date is missing/invalid
    if (student.last_updated) {
      const parsedDate = new Date(student.last_updated).getTime();
      if (!isNaN(parsedDate)) {
        daysSinceUpdate = Math.floor((Date.now() - parsedDate) / 86400000);
      }
    }
    
    if (daysSinceUpdate > 90) {
      showProfileModal(student, true);
    }

    // Fade out loader after min 800ms
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, 800 - elapsed);
    setTimeout(() => {
      clearInterval(msgInterval);
      if (loader) loader.classList.add('fade-out');
    }, remaining);
  });
});

function initButtons(student) {
  document.getElementById('btn-checkin').onclick = (e) => verifyAndAction('IN', student, e);
  document.getElementById('btn-checkout').onclick = (e) => verifyAndAction('OUT', student, e);
}



function renderStudentUI(student) {
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

  // Show only relevant button
  document.getElementById('btn-checkin').style.display = (status === 'OUT' ? 'block' : 'none');
  document.getElementById('btn-checkout').style.display = (status === 'IN' ? 'block' : 'none');

  renderTodayHistory(student.id);
}

function getCurrentStatus(studentId) {
  const movs = getMovements().filter(m => m.studentId === studentId);
  if (movs.length === 0) return 'IN';
  const latest = movs[movs.length - 1];
  return latest.inTime ? 'IN' : 'OUT';
}

/* ── Geofencing Enforcement ──────────────────── */
async function verifyAndAction(target, student, e) {
  const sub = JSON.parse(localStorage.getItem('smt_subscription') || '{}');
  const geofence = sub.config?.geofence;

  if (!geofence) {
    // 🚫 Click Guard (Simplified)
    e.target.disabled = true;
    if (target === 'IN') handleCheckIn(student); else handleCheckOut(student);
    return;
  }

  if (!navigator.geolocation) {
    alert(t('GPS_ERROR'));
    return;
  }

  NexUX.showSkeleton('btn-' + (target === 'IN' ? 'checkin' : 'checkout'), 1);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const dist = calculateDistance(
        pos.coords.latitude, pos.coords.longitude,
        geofence.lat, geofence.lng
      );
      
      if (dist <= geofence.radius) {
        if (target === 'IN') handleCheckIn(student); else handleCheckOut(student);
      } else {
        alert(t('GPS_OUTSIDE') + `\n(You are ${(dist - geofence.radius).toFixed(0)}m away)`);
        renderStudentUI(student);
      }
    },
    (err) => {
      alert(t('GPS_ERROR') + ": " + err.message);
      renderStudentUI(student);
    }
  );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
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
    userAgent: navigator.userAgent, // [SECURITY AUDIT]
    device: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
  });
  startDebounce();
  renderStudentUI(student);
  if (navigator.vibrate) navigator.vibrate(100);
}

/* ── Check-In (Row-Match Rule) ───────────────── */
function handleCheckIn(student) {
  const movs = getMovements();
  // Find the open movement (same student, no inTime)
  const openIdx = movs.findLastIndex(m => m.studentId === student.id && !m.inTime);
  if (openIdx === -1) return; // safety

  const now = new Date().toISOString();
  movs[openIdx].inTime = now;
  movs[openIdx].inUserAgent = navigator.userAgent; // [SECURITY AUDIT]
  saveMovements(movs);
  startDebounce();
  renderStudentUI(student);
  if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
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
    const room = document.getElementById('profile-room').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    if (!newId || !name || !room || !phone) return;

    const oldId = student.id;
    const updates = {
      name, age, department: dept, room, phone,
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
        // [PRODUCTION FIX v80] - Firebase ID Renaming Logic
        const oldData = students[idx];
        const newData = { ...oldData, ...updates, id: newId };
        
        // 1. Delete old node in Firebase
        updateInCollege('students', oldId, null);
        // 2. Create new node in Firebase
        updateInCollege('students', newId, newData);
        
        students[idx] = newData;
        saveStudents(students);
        
        // 3. Update movements
        const movs = getMovements();
        movs.forEach(m => { if (m.studentId === oldId) m.studentId = newId; });
        saveMovements(movs);
        
        saveSession({ userId: newId, collegeId: session.collegeId, role: 'student' });
        student.id = newId;
      }
    } else {
      updateStudent(oldId, updates);
      // Sync to cloud
      updateInCollege('students', oldId, updates);
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
  saveSession(null);
  window.location.href = 'index.html';
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
  const container = document.getElementById('student-chat-messages');
  const session = getSession();
  const isMe = msg.senderId === session.userId;
  
  const div = document.createElement('div');
  div.className = `chat-bubble ${isMe ? 'chat-me' : 'chat-other'}`;
  div.id = `msg-${msg.key}`;
  div.innerHTML = `
    <div class="chat-sender">${msg.senderName}</div>
    <div class="chat-text">${t(msg.text) || msg.text}</div>
    <div class="chat-time">${formatTime(msg.timestamp)}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  
  // Remove "empty" message
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.style.display = 'none';
}

function calcDuration(totalMin) {
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  
  let result = [];
  if (d > 0) result.push(`${d}d`);
  if (h > 0) result.push(`${h}h`);
  if (m > 0 || result.length === 0) result.push(`${m}m`);
  return result.join(' ');
}

window.sendStudentMessage = (e) => {
  e.preventDefault();
  const input = document.getElementById('student-chat-input');
  const text = input.value.trim();
  const session = getSession();
  if (!text) return;

  sendMessage({
    senderId: session.userId,
    senderName: getStudentById(session.userId)?.name || 'Student',
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
  input.value = '';
};

/* ── SOS & Support ── */
window.callWarden = () => {
  const admin = getStudents().find(s => s.role === 'admin');
  if (admin && admin.phone) {
    window.location.href = `tel:${admin.phone}`;
  } else {
    alert('⚠️ No duty warden phone number found.');
  }
};

window.showSupport = () => {
   alert('🛡️ NexTrack Support Center\n\nFor emergencies: Call Warden\nTechnical Issues: support@nextrack.io\nVersion: v80 Stable');
};
