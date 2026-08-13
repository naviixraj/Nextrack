/* ──────────────────────────────────────────────
   auth.js  –  Login, Registration, Forgot Password & Security
   ────────────────────────────────────────────── */

// ── EmailJS Initialization ──
(function() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init("FZBvXpRsuwPKew5dH");
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  // ── RESET LINK CHECK ──
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset');
  if (resetToken) {
    handleResetLink(resetToken);
    return;
  }

  // ── INSTANT SESSION REDIRECT (Speed Boost) ──
  // If we already have a session, don't even wait for Cloud Sync or Loader
  const quickSession = getSession();
  if (quickSession) {
    if (quickSession.role === 'admin') window.location.href = 'admin.html';
    else window.location.href = 'student.html';
    return;
  }

  async function handleResetLink(token) {
    document.body.innerHTML = '<div style="padding: 2rem; text-align: center; font-family: sans-serif;"><h2>Verifying secure link...</h2></div>';
    
    try {
      const snap = await firebaseDB.ref('password_resets/' + token).once('value');
      if (!snap.exists()) {
        alert('❌ Invalid or expired reset link.');
        window.location.href = 'index.html';
        return;
      }
      
      const data = snap.val();
      
      // Link expires after 1 hour (3600000 ms)
      if (Date.now() - data.timestamp > 3600000) {
        alert('❌ This reset link has expired.');
        await firebaseDB.ref('password_resets/' + token).remove();
        window.location.href = 'index.html';
        return;
      }

      const newPwd = prompt(`Enter a new password for ${data.email}:\n(Must be at least 4 characters)`);
      if (!newPwd || newPwd.length < 4) {
        alert('Password must be at least 4 characters. Please click the link in your email again to retry.');
        window.location.href = 'index.html';
        return;
      }

      document.body.innerHTML = '<div style="padding: 2rem; text-align: center; font-family: sans-serif;"><h2>Securely saving new password...</h2></div>';
      
      const hashedNewPwd = await hashPassword(newPwd);
      
      // Update password in Realtime DB
      await updateStudent(data.uid, { password: hashedNewPwd });
      
      // Delete the used token
      await firebaseDB.ref('password_resets/' + token).remove();
      
      alert('✅ Password updated successfully! You can now log in.');
      window.location.href = 'index.html';

    } catch (err) {
      console.error(err);
      alert('❌ Error updating password. Please try again.');
      window.location.href = 'index.html';
    }
  }

  const loader = document.getElementById('startup-loader');
  const msgEl = document.getElementById('startup-msg');
  const messages = [
    "Securely Synchronizing...",
    "NexTrack | Enterprise Intelligence",
    "Verifying Credentials...",
    "Team Titans | Cloud Syncing",
    "Welcome to the Hub — Titans"
  ];
  
  let msgIdx = 0;
  const msgInterval = setInterval(() => {
    if (msgEl) {
      msgEl.style.opacity = 0;
      setTimeout(() => {
        msgEl.textContent = messages[msgIdx % messages.length];
        msgEl.style.opacity = 1;
        msgIdx++;
      }, 200);
    }
  }, 600); // Faster messaging

  const startTime = Date.now();

  initCloudSync(() => {
    // Re-check session after sync just in case
    const session = getSession();
    if (session) {
      if (session.role === 'admin') window.location.href = 'admin.html';
      else window.location.href = 'student.html';
      return;
    }

    // No session: Fade out loader fast
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, 300 - elapsed); 

    setTimeout(() => {
      clearInterval(msgInterval);
      if (loader) loader.classList.add('fade-out');
    }, remaining);

    const loginTab = document.getElementById('tab-login');
    const registerTab = document.getElementById('tab-register');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginMsg = document.getElementById('login-msg');
    const registerMsg = document.getElementById('register-msg');
    const forgotPwdLink = document.getElementById('forgot-pwd-link');
    const tabSlider = document.getElementById('tab-slider');

    // Tab switching
    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      tabSlider.classList.remove('to-register');
      loginForm.classList.add('active');
      registerForm.classList.remove('active');
      loginMsg.innerHTML = '';
      forgotPwdLink.style.display = 'none';
    });

    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      tabSlider.classList.add('to-register');
      registerForm.classList.add('active');
      loginForm.classList.remove('active');
      registerMsg.textContent = '';
      forgotPwdLink.style.display = 'none';
    });

    // ── Photo Preview ──
    const photoInput = document.getElementById('reg-photo');
    const photoPreview = document.getElementById('reg-photo-preview');
    let photoBase64 = '';

     photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) { photoBase64 = ''; photoPreview.style.display = 'none'; return; }
      compressImage(file, 120, (dataUrl) => {
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
          callback(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }

    // ── Forgot Password Logic ──
    forgotPwdLink.addEventListener('click', (e) => {
      e.preventDefault();
      const uid = document.getElementById('login-id').value.trim();
      if (!uid) {
        loginMsg.innerHTML = '⚠️ Please enter your ID first.';
        loginMsg.className = 'form-msg error';
        return;
      }
      handleForgotPassword(uid);
    });

    async function handleForgotPassword(uid) {
      const students = getStudents();
      const user = students.find(s => s.id === uid);
      
      if (!user || !user.email) {
        loginMsg.innerHTML = '❌ User ID not found or no email registered.';
        loginMsg.className = 'form-msg error';
        return;
      }

      if (user.role === 'admin') {
        loginMsg.innerHTML = '❌ Cannot reset admin password from here.';
        loginMsg.className = 'form-msg error';
        return;
      }

      const confirmMsg = `Send password reset email to ${user.email}?`;
      if (!confirm(confirmMsg)) return;

      loginMsg.innerHTML = '<span class="status-toast-premium visible" style="position:static; transform:none; opacity:1; padding:0.5rem; margin-top:0.5rem;">💌 Sending reset link...</span>';

      // 1. Generate 20 character secure token
      const array = new Uint32Array(5);
      window.crypto.getRandomValues(array);
      const token = Array.from(array, dec => dec.toString(36)).join('');
      
      try {
        // 2. Save token to Firebase
        await firebaseDB.ref('password_resets/' + token).set({
          uid: user.id,
          email: user.email,
          timestamp: Date.now()
        });

        // 3. Send via EmailJS
        const resetLink = `${window.location.origin}/index.html?reset=${token}`;
        const templateParams = {
          user_name: user.name,
          to_email: user.email,
          new_password: `Click this secure link to reset your password: ${resetLink}` // Re-using the new_password variable for the link
        };

        await emailjs.send(
          'service_tmis0qo', 
          'template_ujbp5de', 
          templateParams,
          'FZBvXpRsuwPKew5dH'
        );

        loginMsg.className = 'form-msg success';
        loginMsg.innerHTML = '✅ Success! Please check your email for the reset link.';
        forgotPwdLink.style.display = 'none';
      } catch (err) {
        console.error('Email error:', err);
        const errorText = err.text || err.message || JSON.stringify(err);
        loginMsg.className = 'form-msg error';
        loginMsg.innerHTML = `❌ Error: ${errorText}`;
      }
    }

    // ── Login ──
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const uid = document.getElementById('login-id').value.trim();
      const pwd = document.getElementById('login-pwd').value;

      console.log('🔑 Login attempt for ID:', uid);
      const students = getStudents();
      console.log('👥 Currently loaded accounts in cache:', students.map(s => s.id));

      const user = students.find(s => s.id.toLowerCase() === uid.toLowerCase());

      if (!user) {
        loginMsg.textContent = `❌ Invalid ID. (Loaded accounts: ${students.map(s => s.id).join(', ') || 'none'})`;
        loginMsg.className = 'form-msg error';
        forgotPwdLink.style.display = 'none';
        return;
      }

      const hashedPwd = await hashPassword(pwd);

      if (user.password !== hashedPwd) {
        loginMsg.textContent = '❌ Wrong password.';
        loginMsg.className = 'form-msg error';
        forgotPwdLink.style.display = 'inline-block'; // Show Reset Link on wrong password
        return;
      }

      if (user.role === 'admin') {
        setSession({ userId: user.id, role: 'admin', hash: user.password });
        window.location.href = 'admin.html';
      } else {
        setSession({ userId: user.id, role: 'student' });
        window.location.href = 'student.html';
      }
    });

    // ── Register ──
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newId = document.getElementById('reg-id').value.trim();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const room = document.getElementById('reg-room').value.trim();
      const phone = document.getElementById('reg-phone').value.trim();
      const age = document.getElementById('reg-age').value.trim();
      const dept = document.getElementById('reg-dept').value.trim();
      const year = document.getElementById('reg-year') ? document.getElementById('reg-year').value : '';
      const pwd = document.getElementById('reg-pwd').value;
      const pwdC = document.getElementById('reg-pwd-confirm').value;

      const fieldsToCheck = [
        { id: 'reg-name', name: 'Name', value: name },
        { id: 'reg-id', name: 'Registration No.', value: newId },
        { id: 'reg-email', name: 'Email Address', value: email },
        { id: 'reg-photo', name: 'Profile Photo', value: photoBase64 },
        { id: 'reg-room', name: 'Room No.', value: room },
        { id: 'reg-phone', name: 'Phone No.', value: phone },
        { id: 'reg-age', name: 'Age', value: age },
        { id: 'reg-dept', name: 'Department', value: dept },
        { id: 'reg-year', name: 'Year of Study', value: year },
        { id: 'reg-pwd', name: 'Password', value: pwd }
      ];

      for (const field of fieldsToCheck) {
        if (!field.value) {
          const el = document.getElementById(field.id);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (field.id === 'reg-photo') {
              const previewBox = document.getElementById('reg-photo-preview');
              if (previewBox) {
                previewBox.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.5)';
                setTimeout(() => previewBox.style.boxShadow = 'none', 2000);
              }
            } else {
              el.focus();
            }
          }
          registerMsg.textContent = `⚠️ Please fill out your ${field.name}.`;
          registerMsg.className = 'form-msg error';
          return;
        }
      }
      if (pwd !== pwdC) {
        registerMsg.textContent = '⚠️ Passwords do not match.';
        registerMsg.className = 'form-msg error';
        return;
      }
      
      // Strict Alphanumeric Validation
      if (!/^[a-zA-Z0-9]+$/.test(newId)) {
        registerMsg.textContent = '⚠️ Registration ID can only contain letters and numbers.';
        registerMsg.className = 'form-msg error';
        const idEl = document.getElementById('reg-id');
        idEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        idEl.focus();
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
        registerMsg.textContent = '⚠️ This Registration No. is already registered.';
        registerMsg.className = 'form-msg error';
        return;
      }
      
      const id = newId;
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner"></span> Creating Account...';
      submitBtn.disabled = true;

      const hashedPwd = await hashPassword(pwd);

      addStudent({
        id,
        name,
        email,
        room,
        phone,
        age,
        department: dept,
        year,
        password: hashedPwd,
        photo: photoBase64,
        role: 'student',
        last_updated: new Date().toISOString(),
      }).then(() => {
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
    // ── Password Visibility Toggle ──
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('.pwd-toggle');
      if (!toggle) return;
      
      const targetId = toggle.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
    });
  });
});
