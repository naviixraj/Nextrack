/* ──────────────────────────────────────────────
   auth.js  –  SaaS Multi-Tenant Authentication
   ────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginMsg = document.getElementById('login-msg');
  const registerMsg = document.getElementById('register-msg');

  // ── SaaS: Sign In ──
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const collegeId = document.getElementById('login-college').value.trim();
    const uid = document.getElementById('login-id').value.trim();
    const pwd = document.getElementById('login-pwd').value;

    if (!collegeId || !uid || !pwd) {
      setMsg('login-msg', '⚠️ Please fill all fields', 'error');
      return;
    }

    console.log('🚀 Login Submit Triggered:', { collegeId, uid });
    setLoading(e.submitter || loginForm.querySelector('button'), true);

    try {
      // 🏰 SaaS Rule: Handle Master Admin Spawning
      if (uid === 'admin' && pwd === 'admin1234') {
        console.log('🏰 Checking for Institution Spawning...');
        const spawned = await spawnInstitution(collegeId);
        if (spawned) console.log('🏰 New Campus Node Spawned successfully.');
      }

      // Initialize Sync for this college
      console.log('🔄 Initializing College Sync...');
      initCollegeSync(collegeId, async () => {
        console.log('✅ College Synced. Checking user...');
        const user = getStudentById(uid);
        
        if (!user || user.password !== pwd) {
          console.warn('❌ User not found or password mismatch.');
          setMsg('login-msg', '❌ Invalid ID, Password or College ID', 'error');
          setLoading(e.submitter || loginForm.querySelector('button'), false);
          return;
        }

        console.log('✅ User authenticated. Setting session...');
        setSession({ userId: user.id, collegeId, role: user.role || 'student' });
        
        // 🛡️ Security: Set Custom Claims (Optimistic update)
        try {
          if (firebase.functions) {
            console.log('🛰️ Calling setCollegeClaim...');
            const setClaim = firebase.functions().httpsCallable('setCollegeClaim');
            await setClaim({ collegeId, role: user.role || 'student' });
            console.log('🛰️ Claims set successfully.');
          } else {
            console.warn('🚫 Firebase Functions SDK missing from page!');
          }
        } catch (claimErr) {
          console.warn('⚠️ Custom Claims could not be set (Backend not deployed?).', claimErr);
        }

        NexUX.playSuccess();
        console.log('🎨 Success! Redirecting in 800ms...');
        
        setTimeout(() => {
          window.location.href = (user.role === 'admin') ? 'admin.html' : 'student.html';
        }, 800);
      });
    } catch (err) {
      console.error('💥 Auth Crash:', err);
      if (typeof setMsg === 'function') {
        setMsg('login-msg', '❌ Authentication Error: ' + err.message, 'error');
      } else {
        alert('❌ Auth Error: ' + err.message);
      }
      setLoading(e.submitter || loginForm.querySelector('button'), false);
    }
  });

  // ── SaaS: Registration ──
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const collegeId = document.getElementById('reg-college').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const id = document.getElementById('reg-id').value.trim();
    const pwd = document.getElementById('reg-pwd').value;
    const photoBase64 = window.regPhotoBase64 || ''; // Get photo from global var

    if (!collegeId || !name || !id || !pwd) {
      alert('⚠️ All fields are required.');
      return;
    }

    setLoading(e.submitter || registerForm.querySelector('button'), true);

    try {
      // 1. Sync college node to check for existing ID
      initCollegeSync(collegeId, async () => {
        const existing = getStudentById(id);
        if (existing) {
          alert('❌ This Registration Number is already taken in this college.');
          setLoading(e.submitter || registerForm.querySelector('button'), false);
          return;
        }

        // 2. Register Student
        const studentData = {
          id: id,
          name: name,
          password: pwd,
          photo: photoBase64,
          role: 'student',
          last_updated: new Date().toISOString()
        };

        await updateInCollege('students', id, studentData);
        
        // 3. Set Session and Redirect
        saveSession({ userId: id, collegeId: collegeId, role: 'student' });
        
        NexUX.playSuccess();
        setTimeout(() => {
          window.location.href = 'student.html';
        }, 800);
      });
    } catch (err) {
      alert('❌ Registration Failed: ' + err.message);
      setLoading(e.submitter || registerForm.querySelector('button'), false);
    }
  });

  // If already logged in, redirect
  const session = getSession();
  if (session) {
    if (session.role === 'admin') window.location.href = 'admin.html';
    else window.location.href = 'student.html';
  }
});
