/* ──────────────────────────────────────────────
   auth.js  –  Login, Registration & 90-Day Rule
   ────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initCloudSync(() => {
    // If already logged in, redirect
    const session = getSession();
    if (session) {
      if (session.role === 'admin') window.location.href = 'admin.html';
      else window.location.href = 'student.html';
      return;
    }

    const loginTab = document.getElementById('tab-login');
    const registerTab = document.getElementById('tab-register');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginMsg = document.getElementById('login-msg');
    const registerMsg = document.getElementById('register-msg');

    // Tab switching
    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      loginForm.classList.add('active');
      registerForm.classList.remove('active');
      loginMsg.textContent = '';
    });

    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerForm.classList.add('active');
      loginForm.classList.remove('active');
      registerMsg.textContent = '';
    });

    // ── Photo Preview ──
    const photoInput = document.getElementById('reg-photo');
    const photoPreview = document.getElementById('reg-photo-preview');
    let photoBase64 = '';

    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) { photoBase64 = ''; photoPreview.style.display = 'none'; return; }
      compressImage(file, 200, (dataUrl) => {
        photoBase64 = dataUrl;
        photoPreview.src = dataUrl;
        photoPreview.style.display = 'block';
      });
    });

    function compressImage(file, maxSize, callback) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
          else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }

    // ── Login ──
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const collegeId = document.getElementById('login-college').value.trim().toLowerCase();
      const uid = document.getElementById('login-id').value.trim();
      const pwd = document.getElementById('login-pwd').value;

      if (!collegeId || !uid || !pwd) {
        loginMsg.textContent = '❌ All fields are required.';
        loginMsg.className = 'form-msg error';
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner"></span> Verifying...';
      submitBtn.disabled = true;

      try {
        // 🏰 SaaS Spawning Logic (v78)
        // If it's a default admin login for a new college, spawn it.
        if (uid === 'admin' && pwd === 'admin1234') {
          await spawnInstitution(collegeId);
        }

        // Initialize sync for the requested college
        const colRef = firebaseDB.ref(`colleges/${collegeId}/students/${uid}`);
        const snap = await colRef.once('value');
        const user = snap.val();

        if (!user || user.password !== pwd) {
          throw new Error('Invalid ID or password for this college.');
        }

        // 🔐 Set Custom Security Claims (Server-side Lock)
        const setClaim = firebase.functions().httpsCallable('setCollegeClaim');
        await setClaim({ collegeId, role: user.role || 'student' });

        // Update local session
        setSession({ userId: user.id, role: user.role || 'student', collegeId });
        
        // Initialize listeners and redirect
        initCollegeSync(collegeId, () => {
          window.location.href = (user.role === 'admin') ? 'admin.html' : 'student.html';
        });

      } catch (err) {
        console.error(err);
        loginMsg.textContent = `❌ ${err.message}`;
        loginMsg.className = 'form-msg error';
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });

    // ── Register ──
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const collegeId = document.getElementById('reg-college').value.trim().toLowerCase();
      const newId = document.getElementById('reg-id').value.trim();
      const name = document.getElementById('reg-name').value.trim();
      const room = document.getElementById('reg-room').value.trim();
      const phone = document.getElementById('reg-phone').value.trim();
      const age = document.getElementById('reg-age').value.trim();
      const dept = document.getElementById('reg-dept').value.trim();
      const pwd = document.getElementById('reg-pwd').value;
      const pwdC = document.getElementById('reg-pwd-confirm').value;

      if (!collegeId || !newId || !name || !room || !phone || !age || !dept || !pwd || !photoBase64) {
        registerMsg.textContent = '⚠️ All fields are required.';
        registerMsg.className = 'form-msg error';
        return;
      }
      
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner"></span> Creating Account...';
      submitBtn.disabled = true;

      try {
        // Verify institution exists
        const instSnap = await firebaseDB.ref(`colleges/${collegeId}/students/admin`).once('value');
        if (!instSnap.exists()) {
          throw new Error('College ID not found. Contact your warden.');
        }

        // Verify ID unique in THIS college
        const userSnap = await firebaseDB.ref(`colleges/${collegeId}/students/${newId}`).once('value');
        if (userSnap.exists()) {
          throw new Error('Registration No. already exists in this college.');
        }

        const studentData = {
          id: newId,
          name, room, phone, age,
          department: dept,
          password: pwd,
          photo: photoBase64,
          role: 'student',
          last_updated: new Date().toISOString()
        };

        // Write to college-specific node
        await firebaseDB.ref(`colleges/${collegeId}/students/${newId}`).set(studentData);

        // 🔐 Set Claims
        const setClaim = firebase.functions().httpsCallable('setCollegeClaim');
        await setClaim({ collegeId, role: 'student' });

        setSession({ userId: newId, role: 'student', collegeId });
        
        initCollegeSync(collegeId, () => {
          window.location.href = 'student.html';
        });

      } catch (err) {
        console.error(err);
        registerMsg.textContent = `❌ ${err.message}`;
        registerMsg.className = 'form-msg error';
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  });
});
