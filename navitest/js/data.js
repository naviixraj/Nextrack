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

// Cloud Cache (Pre-load from LocalStorage fallbacks to allow fast offline logins)
let fbStudents = [];
try {
  fbStudents = JSON.parse(localStorage.getItem(DB.STUDENTS) || '[]');
} catch (e) {
  console.error('❌ Failed to parse local student cache:', e);
}

let fbMovements = [];
try {
  fbMovements = JSON.parse(localStorage.getItem(DB.MOVEMENTS) || '[]');
} catch (e) {
  console.error('❌ Failed to parse local movements cache:', e);
}

let fbAdminLogins = [];
let fbGeofence = null;
try {
  fbGeofence = JSON.parse(localStorage.getItem('smt_geofence') || 'null');
} catch (e) {
  console.error('❌ Failed to parse local geofence cache:', e);
}

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
async function initCloudSync(onReadyCallback) {
  if (typeof firebaseDB === 'undefined' || !firebaseDB) {
    console.error('❌ Firebase DB missing!');
    if (onReadyCallback) onReadyCallback();
    return;
  }

  let callbackCalled = false;
  const triggerCallback = () => {
    if (!callbackCalled) {
      callbackCalled = true;
      if (onReadyCallback) onReadyCallback();
    }
  };

  // 3.5 Second Safety Fallback Timeout
  const safetyTimeout = setTimeout(async () => {
    console.warn('⚠️ Cloud Sync timed out! Falling back to cached local data.');
    isCloudReady = true;
    
    // Seed local admin fallback so they can log in
    await seedIfNeeded();

    triggerCallback();
  }, 3500);

  // Initial Fetch (Block UI until data loads)
  try {
    const snapshots = await Promise.all([
      firebaseDB.ref('students').once('value'),
      firebaseDB.ref('movements').once('value'),
      firebaseDB.ref('admin_logins').once('value'),
      firebaseDB.ref('geofence').once('value')
    ]);
    
    clearTimeout(safetyTimeout);
    const raw = snapshots[0].val() ? Object.values(snapshots[0].val()) : [];
    fbStudents = raw.map(sanitizeStudent);
    fbMovements = snapshots[1].val() ? Object.values(snapshots[1].val()) : [];
    fbAdminLogins = snapshots[2].val() ? Object.values(snapshots[2].val()) : [];
    fbGeofence = snapshots[3].val() || null;

    isCloudReady = true;

    // Cache online values to LocalStorage for offline capability
    localStorage.setItem(DB.STUDENTS, JSON.stringify(fbStudents));
    localStorage.setItem(DB.MOVEMENTS, JSON.stringify(fbMovements));
    localStorage.setItem('smt_geofence', JSON.stringify(fbGeofence));

    // Attach Real-Time Observers for Cross-Device Sync
    firebaseDB.ref('students').on('value', snap => {
      const raw = snap.val() ? Object.values(snap.val()) : [];
      fbStudents = raw.map(sanitizeStudent);
      localStorage.setItem(DB.STUDENTS, JSON.stringify(fbStudents));
      window.dispatchEvent(new Event('db_updated'));
    });
    firebaseDB.ref('movements').on('value', snap => {
      fbMovements = snap.val() ? Object.values(snap.val()) : [];
      localStorage.setItem(DB.MOVEMENTS, JSON.stringify(fbMovements));
      window.dispatchEvent(new Event('db_updated'));
    });
    firebaseDB.ref('admin_logins').on('value', snap => {
      fbAdminLogins = snap.val() ? Object.values(snap.val()) : [];
      window.dispatchEvent(new Event('db_updated'));
    });
    firebaseDB.ref('geofence').on('value', snap => {
      fbGeofence = snap.val() || null;
      localStorage.setItem('smt_geofence', JSON.stringify(fbGeofence));
      window.dispatchEvent(new Event('db_updated'));
    });

    // Await seeding to avoid race conditions during login checks
    await seedIfNeeded();

    triggerCallback();
  } catch (err) {
    clearTimeout(safetyTimeout);
    console.error('❌ Cloud sync failed:', err);
    // Keep cached students and movements loaded on startup instead of clearing them to []
    isCloudReady = true;
    
    // Seed admin credentials locally as fallback
    await seedIfNeeded();

    if (err.code === 'PERMISSION_DENIED') {
      console.warn("⚠️ Firebase Security Rules are blocking access! Please verify your database rules.");
    }
    triggerCallback();
  }
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
  try {
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
  } catch (e) {
    console.error("❌ Failed to parse local storage session:", e);
    localStorage.removeItem(DB.SESSION);
    return null;
  }
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
function sha256Fallback(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var lengthProperty = 'length';
  var i, j;
  var result = '';
  var words = [];
  var asciiLength = ascii[lengthProperty] * 8;
  var hash = [], k = [];
  var primeCounter = 0;
  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = 1;
      }
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }
  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return;
    words[i >> 2] |= j << ((3 - i % 4) * 8);
  }
  words[words[lengthProperty]] = ((asciiLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiLength | 0);
  for (j = 0; j < words[lengthProperty]; ) {
    var w = words.slice(j, j += 16);
    var oldHash = hash.slice(0);
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      var wItem = w[i];
      if (i >= 16) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        var s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      var sigma0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      var sigma1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      var temp1 = (hash[7] + sigma1 + ch + k[i] + wItem) | 0;
      var temp2 = (sigma0 + maj) | 0;
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash = hash.slice(0, 8);
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    var word = hash[i];
    result += ((word >>> 24) & 0xff).toString(16).padStart(2, '0') +
              ((word >>> 16) & 0xff).toString(16).padStart(2, '0') +
              ((word >>> 8) & 0xff).toString(16).padStart(2, '0') +
              (word & 0xff).toString(16).padStart(2, '0');
  }
  return result;
}

async function hashPassword(password) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.warn("⚠️ crypto.subtle not available (insecure context or file://). Using fallback pure JS SHA-256.");
    return sha256Fallback(password);
  }
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
    const adminObj = {
      id: 'admin',
      name: 'Warden Admin',
      room: '—',
      phone: '—',
      email: 'admin@example.com',
      password: hashedPwd,
      role: 'admin',
      last_updated: new Date().toISOString(),
    };
    fbStudents.push(adminObj); // Seed locally first so login works offline
    localStorage.setItem(DB.STUDENTS, JSON.stringify(fbStudents));
    addStudent(adminObj).catch(err => console.warn('⚠️ Seeding admin online failed:', err));
  } else {
    // UNCONDITIONAL admin password reset to admin1234
    const hashedPwd = await hashPassword('admin1234');
    const adminIdx = fbStudents.findIndex(s => s.id === 'admin');
    if (adminIdx !== -1) {
      fbStudents[adminIdx].password = hashedPwd;
      fbStudents[adminIdx].role = 'admin';
    } else {
      // If admin role exists under different id or admin id is missing, create/re-create id 'admin'
      const adminObj = {
        id: 'admin',
        name: 'Warden Admin',
        room: '—',
        phone: '—',
        email: 'admin@example.com',
        password: hashedPwd,
        role: 'admin',
        last_updated: new Date().toISOString(),
      };
      fbStudents.push(adminObj);
    }
    localStorage.setItem(DB.STUDENTS, JSON.stringify(fbStudents));
    updateStudent('admin', { password: hashedPwd, role: 'admin' }).catch(err => console.warn('⚠️ Updating admin online failed:', err));
  }
}

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
