/* ──────────────────────────────────────────────
   firebase-config.js  –  Firebase Initialization
   ────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: "AIzaSyA0-chN37BdQeq-69TeElXd0RSHULjCJgw",
  authDomain: "nextrack-test.firebaseapp.com",
  databaseURL: "https://nextrack-test-default-rtdb.firebaseio.com",
  projectId: "nextrack-test",
  storageBucket: "nextrack-test.firebasestorage.app",
  messagingSenderId: "424504345504",
  appId: "1:424504345504:web:bb6f73afda1a1a05e1dac5",
  measurementId: "G-QZ8M07CFLC"
};

let firebaseDB = null;
let firebaseChatReady = false;

try {
  firebase.initializeApp(firebaseConfig);
  firebaseDB = firebase.database();

  // Sign in anonymously to get an auth context for security rules
  firebase.auth().signInAnonymously()
    .then(() => {
      console.log('🔒 Firebase Anonymous Auth success');
    })
    .catch((error) => {
      console.warn('⚠️ Firebase Anonymous Auth failed:', error.message);
    });

  // Listen to Firebase Auth state for security
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      firebaseChatReady = true;
      console.log('🔐 Signed in anonymously. User UID:', user.uid);
    } else {
      firebaseChatReady = false;
      console.log('⚠️ User is signed out');
    }
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

// ── Global Loader Fail-Safe Timeout ──
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const loader = document.getElementById('startup-loader');
    if (loader && !loader.classList.contains('fade-out')) {
      console.warn("⚠️ Global fail-safe timeout triggered to hide startup loader.");
      loader.classList.add('fade-out');
      document.body.style.overflow = '';
    }
  }, 4000);
});

// ── Firebase Chat Functions ─────────────────────
function sendFirebaseMessage(msg) {
  if (!firebaseDB) {
    console.error('❌ Cannot send: Firebase not initialized');
    return;
  }
  return firebaseDB.ref('messages').push(msg)
    .then(() => console.log('✅ Message sent'))
    .catch((err) => console.error('❌ Send failed:', err));
}

function listenForMessages(callback) {
  if (!firebaseDB) {
    console.error('❌ Cannot listen: Firebase not initialized');
    return;
  }
  firebaseDB.ref('messages')
    .orderByChild('timestamp')
    .limitToLast(200)
    .on('value', (snapshot) => {
      const msgs = [];
      snapshot.forEach((child) => {
        msgs.push({ firebaseKey: child.key, ...child.val() });
      });
      callback(msgs);
    }, (err) => {
      console.error('❌ Firebase listen error:', err);
    });
}

function deleteFirebaseMessage(firebaseKey) {
  if (!firebaseDB) return;
  return firebaseDB.ref('messages/' + firebaseKey).remove()
    .then(() => console.log('🗑 Message deleted'))
    .catch((err) => console.error('❌ Delete failed:', err));
}

function editFirebaseMessage(firebaseKey, newText) {
  if (!firebaseDB) return;
  return firebaseDB.ref('messages/' + firebaseKey).update({
    text: newText,
    edited: true
  })
    .then(() => console.log('✏️ Message edited'))
    .catch((err) => console.error('❌ Edit failed:', err));
}

function deleteAllFirebaseMessages() {
  if (!firebaseDB) return;
  return firebaseDB.ref('messages').remove()
    .then(() => console.log('🗑 All messages deleted'))
    .catch((err) => console.error('❌ Delete all failed:', err));
}
