/* ──────────────────────────────────────────────
   firebase-config.js  –  Firebase Initialization
   ────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: "AIzaSyAdlL6GzNox-9xdw6NEvPJW1eVLMc-GvPQ",
  authDomain: "nextrack-34110.firebaseapp.com",
  databaseURL: "https://nextrack-34110-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nextrack-34110",
  storageBucket: "nextrack-34110.firebasestorage.app",
  messagingSenderId: "860673203541",
  appId: "1:860673203541:web:69777e3983bfdd52d323dc",
  measurementId: "G-L2JZD6N97V"
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
