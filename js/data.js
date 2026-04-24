/* ──────────────────────────────────────────────
   data.js  –  localStorage CRUD & utility layer
   ────────────────────────────────────────────── */

// 📦 Production Storage Engine (v80)
// Keys are now dynamic prefixes to prevent cross-college leaks
function getDbKey(type) {
  const session = JSON.parse(sessionStorage.getItem('smt_session') || '{}');
  const prefix = session.collegeId ? `${session.collegeId}_` : 'smt_';
  const mapping = {
    STUDENTS: 'students',
    MOVEMENTS: 'movements',
    SESSION: 'session',
    SUB: 'subscription'
  };
  return prefix + mapping[type];
}

function getSession() {
  return JSON.parse(sessionStorage.getItem('smt_session') || 'null');
}

function saveSession(data) {
  sessionStorage.setItem('smt_session', JSON.stringify(data));
}

/* ── Helpers ─────────────────────────────────── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Returns human-readable duration string from two ISO strings */
function calcDuration(outIso, inIso) {
  if (!outIso || !inIso) return '—';
  const ms = new Date(inIso) - new Date(outIso);
  if (ms < 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  
  let result = [];
  if (d > 0) result.push(`${d}d`);
  if (h > 0) result.push(`${h}h`);
  if (m > 0 || result.length === 0) result.push(`${m}m`);
  return result.join(' ');
}

/** Returns duration in minutes (for threshold checks) */
function durationMinutes(outIso, inIso) {
  if (!outIso || !inIso) return 0;
  return Math.max(0, Math.floor((new Date(inIso) - new Date(outIso)) / 60000));
}

/** Check if an ISO time's hour:minute is >= 19:00 */
function isAfterCurfew(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() > 19 || (d.getHours() === 19 && d.getMinutes() >= 0);
}

/** Check if right now is past 19:01 */
/** Check if right now is past the college's curfew */
function isNowPastCurfew() {
  const sub = JSON.parse(localStorage.getItem(getDbKey('SUBSCRIPTION')) || '{}');
  const customCurfew = sub.config?.curfewTime || '19:00';
  const [targetH, targetM] = customCurfew.split(':').map(Number);
  
  const now = new Date();
  const currentH = now.getHours();
  const currentM = now.getMinutes();
  
  return currentH > targetH || (currentH === targetH && currentM >= targetM);
}

/* ── Students CRUD ───────────────────────────── */
function getStudents() {
  return JSON.parse(localStorage.getItem(getDbKey('STUDENTS')) || '[]');
}

function saveStudents(arr) {
  try {
    localStorage.setItem(getDbKey('STUDENTS'), JSON.stringify(arr));
  } catch (e) {
    alert('⚠️ Phone memory is full. App might be slow.');
  }
}

function getStudentById(id) {
  return getStudents().find(s => s.id === id) || null;
}

function addStudent(student) {
  const students = getStudents();
  students.push(student);
  saveStudents(students);
}

/** 🖼️ Photo Squeezer (Canvas Compression) 
 * Resizes large images to 200px wide to save database space.
 */
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% Quality
      };
    };
    reader.onerror = error => reject(error);
  });
}

function updateStudent(id, updates) {
  const students = getStudents();
  const idx = students.findIndex(s => s.id === id);
  if (idx === -1) return false;
  Object.assign(students[idx], updates);
  saveStudents(students);
  return true;
}

/* ── Movements CRUD ──────────────────────────── */
function getMovements() {
  return JSON.parse(localStorage.getItem(getDbKey('MOVEMENTS')) || '[]');
}

function saveMovements(arr) {
  try {
    localStorage.setItem(getDbKey('MOVEMENTS'), JSON.stringify(arr));
  } catch (e) {
     console.error('Storage full');
  }
}

function addMovement(mov) {
  const movs = getMovements();
  movs.push(mov);
  saveMovements(movs);
  
  // [v80 REAL-TIME SYNC]
  pushToCollege('movements', mov);
}

function updateMovement(movId, updates) {
  const movs = getMovements();
  const idx = movs.findIndex(m => m.id === movId);
  if (idx === -1) return false;
  Object.assign(movs[idx], updates);
  saveMovements(movs);
  
  // [v80 REAL-TIME SYNC]
  // We find the entry in Firebase by its local ID mapping 
  // (In production, you would store the Firebase UID on the movement object)
  // For now, we update the student's current state.
  updateInCollege('movements', movId, updates);
  return true;
}

/** Get movements for a specific date string (YYYY-MM-DD) */
function getMovementsByDate(dateStr) {
  return getMovements().filter(m => {
    const d = new Date(m.outTime);
    const mDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return mDate === dateStr;
  });
}

/* ── Session (Consolidated) ─────────────────── */
function getSession() {
  return JSON.parse(sessionStorage.getItem('smt_session') || 'null');
}

function saveSession(data) {
  sessionStorage.setItem('smt_session', JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem('smt_session');
}

/* ── Firebase Cloud Sync (v78 SaaS) ─────────── */
let firebaseSyncReady = false;

/** 
 * v80.1: Simplified and Robust Cloud Sync
 */
async function initCollegeSync(collegeId) {
  if (!collegeId) return;
  const colRef = firebaseDB.ref(`colleges/${collegeId}`);
  
  console.log('📡 Starting Cloud Handshake:', collegeId);

  // 🛰️ v80.6 Anti-Freeze: Skip cloud wait after 5s if connection is slow
  const syncPromise = colRef.once('value');
  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 5000));

  try {
    const snap = await Promise.race([syncPromise, timeoutPromise]);
    
    if (snap) {
      const data = snap.val() || {};
      saveStudents(Object.values(data.students || {}));
      saveMovements(Object.values(data.movements || {}));
      localStorage.setItem('smt_subscription', JSON.stringify(data.subscription || {}));
      console.log('✅ Cloud Connected.');
    } else {
      console.warn('⚠️ Cloud Timeout: Using local cache to prevent UI freeze.');
    }
  } catch (err) {
    console.warn('⚠️ Sync Error:', err);
  }

  firebaseSyncReady = true;

  // 🔄 Real-time Background Sync
  colRef.child('students').on('value', s => saveStudents(Object.values(s.val() || {})));
  colRef.child('movements').on('value', s => saveMovements(Object.values(s.val() || {})));
  colRef.child('subscription').on('value', s => localStorage.setItem('smt_subscription', JSON.stringify(s.val() || {})));

  return true; 
}

// [NexUX moved to ux.js for premium features]

/** Global wrapper for Cloud Push */
function pushToCollege(node, data) {
  const session = getSession();
  if (!session || !session.collegeId) return;
  return firebaseDB.ref(`colleges/${session.collegeId}/${node}`).push(data);
}

function updateInCollege(node, id, updates) {
  const session = getSession();
  if (!session || !session.collegeId) return;
  // Note: we assume ID is the registration no. but we should use Firebase keys for real production
  return firebaseDB.ref(`colleges/${session.collegeId}/${node}/${id}`).update(updates);
}

/* ── Seed / Init ─────────────────────────────── */
/** Spawns a default admin for a NEW college if it doesn't exist */
async function spawnInstitution(collegeId) {
  const colRef = firebaseDB.ref(`colleges/${collegeId}`);
  const snap = await colRef.child('students/admin').once('value');
  
  if (!snap.exists()) {
    const adminData = {
      id: 'admin',
      name: 'Master Warden',
      password: 'admin1234',
      role: 'admin',
      created_at: new Date().toISOString(),
      subscription: {
        status: 'trial',
        trialStartDate: new Date().toISOString()
      }
    };
    await colRef.child('students/admin').set(adminData);
    await colRef.child('subscription').set(adminData.subscription);
    console.log(`🏰 Institution [${collegeId}] spawned successfully.`);
    return true;
  }
  return false;
}

// 🚀 CONNECTIVITY GUARD (v80)
window.addEventListener('online', () => updateOnlineStatus());
window.addEventListener('offline', () => updateOnlineStatus());

function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  let banner = document.getElementById('offline-guard-banner');
  
  if (!isOnline) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-guard-banner';
      banner.innerHTML = '⚠️ Connection Lost. Check-ins might fail until online.';
      Object.assign(banner.style, {
        position: 'fixed', top: '0', left: '0', right: '0', zIndex: '999999',
        background: '#ef4444', color: 'white', textAlign: 'center',
        padding: '10px', fontWeight: 'bold', fontSize: '0.85rem'
      });
      document.body.appendChild(banner);
    }
  } else if (banner) {
    banner.remove();
  }
}
// Run on start
setTimeout(updateOnlineStatus, 1000);
