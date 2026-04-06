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
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const uid = document.getElementById('login-id').value.trim();
      const pwd = document.getElementById('login-pwd').value;

      const students = getStudents();
      const user = students.find(s => s.id === uid && s.password === pwd);
      if (!user) {
        loginMsg.textContent = '❌ Invalid ID or password.';
        loginMsg.className = 'form-msg error';
        return;
      }

      setSession({ userId: user.id, role: user.role || 'student' });

      if (user.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'student.html';
      }
    });

    // ── Register ──
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newId = document.getElementById('reg-id').value.trim();
      const name = document.getElementById('reg-name').value.trim();
      const room = document.getElementById('reg-room').value.trim();
      const phone = document.getElementById('reg-phone').value.trim();
      const age = document.getElementById('reg-age').value.trim();
      const dept = document.getElementById('reg-dept').value.trim();
      const year = document.getElementById('reg-year') ? document.getElementById('reg-year').value : '';
      const pwd = document.getElementById('reg-pwd').value;
      const pwdC = document.getElementById('reg-pwd-confirm').value;

      if (!newId || !name || !room || !phone || !age || !dept || !pwd || !photoBase64) {
        registerMsg.textContent = '⚠️ All fields including Student ID and photo are required.';
        registerMsg.className = 'form-msg error';
        return;
      }
      if (pwd !== pwdC) {
        registerMsg.textContent = '⚠️ Passwords do not match.';
        registerMsg.className = 'form-msg error';
        return;
      }
      if (pwd.length < 4) {
        registerMsg.textContent = '⚠️ Password must be at least 4 characters.';
        registerMsg.className = 'form-msg error';
        return;
      }

      // Verify ID is unique
      const existing = getStudentById(newId);
      if (existing) {
        registerMsg.textContent = '⚠️ This Student ID is already registered.';
        registerMsg.className = 'form-msg error';
        return;
      }
      
      const id = newId;
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner"></span> Creating Account...';
      submitBtn.disabled = true;

      addStudent({
        id,
        name,
        room,
        phone,
        age,
        department: dept,
        year,
        password: pwd,
        photo: photoBase64,
        role: 'student',
        last_updated: new Date().toISOString(),
      }).then(() => {
        // Auto-login and redirect ONLY AFTER cloud write succeeds!
        setSession({ userId: id, role: 'student' });
        window.location.href = 'student.html';
      }).catch(err => {
        console.error(err);
        registerMsg.textContent = '❌ Registration failed (Network error).';
        registerMsg.className = 'form-msg error';
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      });
    });
  });
});
