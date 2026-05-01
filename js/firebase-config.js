/* ──────────────────────────────────────────────
   firebase-config.js  –  Firebase Initialization
   ────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: "AIzaSyCnxDRER1laogyS4OareR0F2bAhB0GKjPc",
  authDomain: "nxtrack-a5fe1.firebaseapp.com",
  projectId: "nxtrack-a5fe1",
  storageBucket: "nxtrack-a5fe1.firebasestorage.app",
  messagingSenderId: "293860363431",
  appId: "1:293860363431:web:a4547e076d5dc4c59b5f82",
  measurementId: "G-C959HPYQQX"
};

let firebaseDB = null;
let firebaseChatReady = false;

try {
  firebase.initializeApp(firebaseConfig);
  firebaseDB = firebase.database();

  // Auto sign-in anonymously for security
  firebase.auth().signInAnonymously()
    .then(() => {
      firebaseChatReady = true;
      console.log('🔐 Signed in anonymously — chat is secure!');
    })
    .catch((err) => {
      console.error('❌ Anonymous sign-in failed:', err);
    });

  // Connection status
  firebaseDB.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === true) {
      console.log('✅ Firebase database is CONNECTED');
    } else {
      console.log('⚠️ Firebase database is DISCONNECTED');
    }
  });

  console.log('🔥 Firebase initialized');

} catch (err) {
  console.error('❌ Firebase init failed:', err);
}

// ── Firebase Chat Functions ─────────────────────
function sendMessage(msg) {
  const session = getSession();
  if (!session || !session.collegeId) return;
  return firebaseDB.ref(`colleges/${session.collegeId}/messages`).push(msg);
}

function listenToMessages(callback) {
  const session = getSession();
  if (!session || !session.collegeId) return;
  firebaseDB.ref(`colleges/${session.collegeId}/messages`)
    .limitToLast(50) // Performance: only load last 50
    .on('child_added', (snap) => {
      callback({ key: snap.key, ...snap.val() });
    });
  
  // Real-time Sync for Edits & Deletes
  firebaseDB.ref(`colleges/${session.collegeId}/messages`).on('child_changed', (snap) => {
     if (window.updateChatMessageUI) window.updateChatMessageUI({ key: snap.key, ...snap.val() });
  });
  firebaseDB.ref(`colleges/${session.collegeId}/messages`).on('child_removed', (snap) => {
     if (window.removeChatMessageUI) window.removeChatMessageUI(snap.key);
  });
}

function deleteMessage(firebaseKey) {
  const session = getSession();
  if (!session || !session.collegeId) return;
  return firebaseDB.ref(`colleges/${session.collegeId}/messages/${firebaseKey}`).remove();
}

function updateMessage(firebaseKey, newText) {
  const session = getSession();
  if (!session || !session.collegeId) return;
  return firebaseDB.ref(`colleges/${session.collegeId}/messages/${firebaseKey}`).update({
    text: newText,
    edited: true,
    editedAt: firebase.database.ServerValue.TIMESTAMP
  });
}

function deleteAllFirebaseMessages() {
  const session = getSession();
  if (!session || !session.collegeId) return;
  return firebaseDB.ref(`colleges/${session.collegeId}/messages`).remove();
}
