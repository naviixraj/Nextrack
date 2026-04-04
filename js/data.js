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

/** Check if an ISO time's hour:minute is >= 19:00 */
function isAfterCurfew(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() > 19 || (d.getHours() === 19 && d.getMinutes() >= 0);
}

/** Check if right now is past 19:01 */
function isNowPastCurfew() {
  const now = new Date();
  return now.getHours() > 19 || (now.getHours() === 19 && now.getMinutes() >= 1);
}

/* ── Students CRUD ───────────────────────────── */
function getStudents() {
  return JSON.parse(localStorage.getItem(DB.STUDENTS) || '[]');
}

function saveStudents(arr) {
  localStorage.setItem(DB.STUDENTS, JSON.stringify(arr));
}

function getStudentById(id) {
  return getStudents().find(s => s.id === id) || null;
}

function addStudent(student) {
  const students = getStudents();
  students.push(student);
  saveStudents(students);
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
  return JSON.parse(localStorage.getItem(DB.MOVEMENTS) || '[]');
}

function saveMovements(arr) {
  localStorage.setItem(DB.MOVEMENTS, JSON.stringify(arr));
}

function addMovement(mov) {
  const movs = getMovements();
  movs.push(mov);
  saveMovements(movs);
}

function updateMovement(movId, updates) {
  const movs = getMovements();
  const idx = movs.findIndex(m => m.id === movId);
  if (idx === -1) return false;
  Object.assign(movs[idx], updates);
  saveMovements(movs);
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

/* ── Session ─────────────────────────────────── */
function getSession() {
  return JSON.parse(sessionStorage.getItem(DB.SESSION) || 'null');
}

function setSession(obj) {
  sessionStorage.setItem(DB.SESSION, JSON.stringify(obj));
}

function clearSession() {
  sessionStorage.removeItem(DB.SESSION);
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

/* ── Geofence Settings ───────────────────────── */
function getGeofence() {
  return JSON.parse(localStorage.getItem('smt_geofence') || 'null');
}

function saveGeofence(settings) {
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
function seedIfNeeded() {
  const students = getStudents();
  const hasAdmin = students.some(s => s.role === 'admin');
  if (!hasAdmin) {
    addStudent({
      id: 'admin',
      name: 'Warden Admin',
      room: '—',
      phone: '—',
      password: 'admin123',
      role: 'admin',
      last_updated: new Date().toISOString(),
    });
  }
}

// Run seed on load
seedIfNeeded();
