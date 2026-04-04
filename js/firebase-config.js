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
