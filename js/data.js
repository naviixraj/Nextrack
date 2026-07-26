/* ──────────────────────────────────────────────
   data.js  –  localStorage CRUD & utility layer
   ────────────────────────────────────────────── */

const DB = {
  STUDENTS: 'smt_students',
  MOVEMENTS: 'smt_movements',
  SESSION: 'smt_session',
};

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
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Returns duration in minutes (for threshold checks) */
function durationMinutes(outIso, inIso) {
  if (!outIso || !inIso) return 0;
  return Math.max(0, Math.floor((new Date(inIso) - new Date(outIso)) / 60000));
}

/** Convert any Date object to strict IST (UTC+5:30) */
function toIST(dateObj) {
  const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 5.5));
}

/** Check if an ISO time's hour:minute is >= 19:00 */
function isAfterCurfew(iso) {
  if (!iso) return false;
  const d = toIST(new Date(iso));
  return d.getHours() > 19 || (d.getHours() === 19 && d.getMinutes() >= 0);
}

/** Check if right now is past 19:01 */
function isNowPastCurfew() {
  const now = toIST(new Date());
  return now.getHours() > 19 || (now.getHours() === 19 && now.getMinutes() >= 1);
}

// Cloud Cache
let fbStudents = [];
let fbMovements = [];
let fbAdminLogins = [];
let fbGeofence = null;
let isCloudReady = false;

/* ── Date and Time Logic ─────────────────────── */
// Bug #7 Fix: Global Time Zone (IST UTC+5:30)
function getISTDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 5.5));
}

function getCurfewStatus() {
  const istNow = getISTDate();
  const h = istNow.getHours();
  return h >= 19 || h < 6; // 7 PM to 6 AM IST
}

/* ── Exports for PWA & Debugging ─────────────── */
/* ── Cloud Sync Engine ───────────────────────── */
function initCloudSync(onReadyCallback) {
  if (typeof firebaseDB === 'undefined' || !firebaseDB) {
    console.error('❌ Firebase DB missing!');
    if (onReadyCallback) onReadyCallback();
    return;
  }

  // Ensure Firebase Auth is ready before fetching data
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) return; // Wait until signed in (anonymous or otherwise)

    // Initial Fetch (Block UI until data loads)
    Promise.all([
      firebaseDB.ref('students').once('value'),
      firebaseDB.ref('movements').once('value'),
      firebaseDB.ref('admin_logins').once('value'),
      firebaseDB.ref('geofence').once('value')
    ]).then(snapshots => {
      const raw = snapshots[0].val() ? Object.values(snapshots[0].val()) : [];
      fbStudents = raw.map(sanitizeStudent);
      fbMovements = snapshots[1].val() ? Object.values(snapshots[1].val()) : [];
      fbAdminLogins = snapshots[2].val() ? Object.values(snapshots[2].val()) : [];
      fbGeofence = snapshots[3].val() || null;
/* ── XSS Sanitizer Shield (Bug #5) ──────────────────────── */
function safeHTML(str) {
  if (typeof str !== 'string') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function sanitizeStudent(s) {
  if (!s) return s;
  return {
    ...s,
    name: safeHTML(s.name),
    photo: safeHTML(s.photo),
    id: safeHTML(s.id),
    email: safeHTML(s.email),
    phone: safeHTML(s.phone),
    room: safeHTML(s.room),
    dept: safeHTML(s.dept),
    year: safeHTML(s.year),
    role: safeHTML(s.role)
  };
}

      isCloudReady = true;

      // Attach Real-Time Observers for Cross-Device Sync
      firebaseDB.ref('students').on('value', snap => {
        const raw = snap.val() ? Object.values(snap.val()) : [];
        fbStudents = raw.map(sanitizeStudent);
        window.dispatchEvent(new Event('db_updated'));
      });
      firebaseDB.ref('movements').on('value', snap => {
        fbMovements = snap.val() ? Object.values(snap.val()) : [];
        window.dispatchEvent(new Event('db_updated'));
      });
      firebaseDB.ref('admin_logins').on('value', snap => {
        fbAdminLogins = snap.val() ? Object.values(snap.val()) : [];
        window.dispatchEvent(new Event('db_updated'));
      });
      firebaseDB.ref('geofence').on('value', snap => {
        fbGeofence = snap.val() || null;
        window.dispatchEvent(new Event('db_updated'));
      });

      // Run seed only after initial data is completely loaded
      seedIfNeeded();

      if (onReadyCallback) onReadyCallback();
    }).catch(err => {
      console.error('❌ Cloud sync failed:', err);
      // Give a highly visible alert if this was a true security rule error
      if (err.code === 'PERMISSION_DENIED') {
        alert("⚠️ Firebase Security Rules are blocking access! Please go to your Firebase Console -> Realtime Database -> Rules, and set read and write to true.");
      }
      if (onReadyCallback) onReadyCallback();
    });
  });
}

/* ── Students CRUD (Cloud) ───────────────────── */
function getStudents() {
  return fbStudents;
}

function saveStudents(arr) {
  // Legacy function: We should overwrite the node but as an object map for safety.
  // Converting array back to object keyed by ID
  const map = {};
  arr.forEach(s => { map[s.id] = s; });
  return firebaseDB.ref('students').set(map);
}

function getStudentById(id) {
  return fbStudents.find(s => s.id === id) || null;
}

function addStudent(student) {
  return firebaseDB.ref('students/' + student.id).set(student);
}

function updateStudent(id, updates) {
  return firebaseDB.ref('students/' + id).update(updates);
}

/* ── Movements CRUD (Cloud) ──────────────────── */
function getMovements() {
  return fbMovements.sort((a, b) => new Date(a.outTime) - new Date(b.outTime));
}

function saveMovements(arr) {
  const map = {};
  arr.forEach(m => { map[m.id] = m; });
  return firebaseDB.ref('movements').set(map);
}

function addMovement(mov) {
  return firebaseDB.ref('movements/' + mov.id).set(mov);
}

function updateMovement(movId, updates) {
  return firebaseDB.ref('movements/' + movId).update(updates);
}

/** Get movements for a specific date string (YYYY-MM-DD) */
function getMovementsByDate(dateStr) {
  return fbMovements.filter(m => {
    if (!m || !m.outTime) return false;
    const d = new Date(m.outTime);
    if (isNaN(d.getTime())) return false;
    const mDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return mDate === dateStr;
  });
}

/* ── Session ─────────────────────────────────── */
function getSession() {
  const sessionStr = localStorage.getItem(DB.SESSION);
  if (!sessionStr) return null;
  const session = JSON.parse(sessionStr);
  
  // Bug #11 (Infinite Sessions) -> 6 Month Expiration (180 days = 15552000000 ms)
  if (session && session.timestamp) {
    const age = Date.now() - session.timestamp;
    if (age > 15552000000) {
      console.warn("Session expired (older than 6 months). Logging out.");
      localStorage.removeItem(DB.SESSION);
      return null;
    }
  }
  return session;
}

function setSession(obj) {
  obj.timestamp = Date.now();
  localStorage.setItem(DB.SESSION, JSON.stringify(obj));
}

function clearSession() {
  localStorage.removeItem(DB.SESSION);
}

/* ── Chat Messages ───────────────────────────── */
function getMessages() {
  return JSON.parse(localStorage.getItem('smt_messages') || '[]');
}

function saveMessages(arr) {
  localStorage.setItem('smt_messages', JSON.stringify(arr));
}

function addMessage(msg) {
  const msgs = getMessages();
  msgs.push(msg);
  // Keep only last 200 messages to avoid localStorage overflow
  if (msgs.length > 200) msgs.splice(0, msgs.length - 200);
  saveMessages(msgs);
}

/* ── Geofence Settings (Synced) ────────────────── */
function getGeofence() {
  return fbGeofence;
}

function saveGeofence(settings) {
  if (typeof firebaseDB !== 'undefined' && firebaseDB) {
    return firebaseDB.ref('geofence').set(settings);
  }
  // Fallback (for offline or local testing)
  localStorage.setItem('smt_geofence', JSON.stringify(settings));
}

/**
 * Haversine distance between two lat/lng points in meters
 */
function geoDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if given coordinates are inside the geofence
 * Returns { inside: bool, distance: number (meters) } or null if no geofence
 */
function checkGeofence(lat, lng) {
  const geo = getGeofence();
  if (!geo || !geo.lat || !geo.lng || !geo.radius) return null;
  const dist = geoDistance(lat, lng, geo.lat, geo.lng);
  return { inside: dist <= geo.radius, distance: Math.round(dist) };
}

/* ── Seed / Init ─────────────────────────────── */
async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function seedIfNeeded() {
  const students = getStudents();
  const adminExists = students.some(s => s.role === 'admin');
  
  if (!adminExists) {
    // 🔓 EMERGENCY PASSWORD RESET (Force Overwrite)
    const hashedPwd = await hashPassword('admin1234');
    addStudent({
      id: 'admin',
      name: 'Warden Admin',
      room: '—',
      phone: '—',
      email: 'admin@example.com',
      password: hashedPwd,
      role: 'admin',
      last_updated: new Date().toISOString(),
    });
  } else if (!localStorage.getItem('admin_force_reset_done_v2')) {
    // ONE-TIME FORCE RESET for existing admin
    const hashedPwd = await hashPassword('admin1234');
    updateStudent('admin', { password: hashedPwd });
    localStorage.setItem('admin_force_reset_done_v2', 'true');
    console.log('✅ Master admin password forcefully reset to admin1234');
  }
}
