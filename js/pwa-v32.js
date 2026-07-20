/**
 * pwa-v32.js - Unified NexTrack Progressive Web App Handler
 * Manages service worker registration and platform-specific installation prompts.
 * This version (v32) removes the infinite refresh loop 'controllerchange' event.
 */

let deferredPrompt;
const APP_VERSION = 'v105';

// 1. Register Service Worker with a Static Version Buster
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Using a static version string for v32 to break any previous reload loops
    navigator.serviceWorker.register(`sw.js?v=${APP_VERSION}`).then(reg => {
      console.log('🚀 PWA Active:', reg.scope);
      
      // Check for updates
      reg.update();

      // Case 1: A new version is already waiting in the background
      if (reg.waiting) {
        showPremiumUpdateModal(reg.waiting);
      }

      // Case 2: A new version is detected and begins installing
      reg.onupdatefound = () => {
        const newWorker = reg.installing;
        newWorker.onstatechange = () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showPremiumUpdateModal(newWorker);
          }
        };
      };
    }).catch(err => console.log('❌ PWA Error:', err));
  });

  /**
   * CRITICAL FIX (v32):
   * I have REMOVED the 'controllerchange' reload event.
   * This was the cause of the infinite 'blinking' refresh loop on mobile.
   * The page will now only refresh manually when the user clicks 'Update Now'.
   */
}

// Inject CSS dynamically so it works on index.html (which lacks style.css)
if (!document.getElementById('pwa-modal-styles')) {
  const style = document.createElement('style');
  style.id = 'pwa-modal-styles';
  style.innerHTML = `
    .update-overlay {
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem; opacity: 0; visibility: hidden; transition: all 0.5s ease;
    }
    .update-overlay.visible { opacity: 1; visibility: visible; }
    .update-modal {
      max-width: 400px; width: 100%; background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(25px) saturate(200%); border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 28px; padding: 2.5rem 2rem; text-align: center;
      transform: scale(0.9) translateY(20px); transition: all 0.6s cubic-bezier(0.19, 1, 0.22, 1);
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(102, 126, 234, 0.15);
      color: white; font-family: 'Inter', sans-serif;
    }
    .update-overlay.visible .update-modal { transform: scale(1) translateY(0); }
    .update-icon {
      width: 64px; height: 64px; margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px; display: flex; align-items: center; justify-content: center;
      font-size: 2rem; box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
    }
    .update-title { font-size: 1.4rem; font-weight: 800; margin-bottom: 0.8rem; color: #fff; }
    .update-desc { font-size: 0.92rem; color: rgba(255,255,255,0.7); line-height: 1.6; margin-bottom: 2rem; }
    .update-btn {
      width: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none; color: #fff; padding: 1rem; border-radius: 14px; font-weight: 700;
      font-size: 1rem; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }
    .update-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4); }
  `;
  document.head.appendChild(style);
}

/**
 * Shows the premium glassmorphism update modal
 */
window.showPremiumUpdateModal = function(worker) {
  if (document.getElementById('pwa-update-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pwa-update-modal';
  overlay.className = 'update-overlay';
  overlay.innerHTML = `
    <div class="update-modal">
      <div class="update-icon">🚀</div>
      <h2 class="update-title">Feature Update</h2>
      <p class="update-desc">We've added some powerful new features to NexTrack. Refresh now to experience the latest version.</p>
      <button class="update-btn" id="pwa-refresh-btn">Update Now</button>
      <button class="btn btn-ghost btn-small" onclick="document.getElementById('pwa-update-modal').remove()" style="margin-top:1.5rem; opacity:0.5; font-size:0.75rem; background:transparent; border:none; color:white; cursor:pointer;">Close Preview</button>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const refreshBtn = document.getElementById('pwa-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      overlay.classList.remove('visible');
      
      try {
        // Step 1: Unregister current SW to break the cache loop
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
        
        // Step 2: Signal worker to skip waiting if possible
        if (worker) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
        
        // Step 3: Hard reload with cache-buster
        const url = new URL(window.location.href);
        url.searchParams.set('upd', Date.now());
        window.location.replace(url.href);
      } catch (err) {
        window.location.reload();
      }
    });
  }

  // Show with minor delay for animation smoothness
  setTimeout(() => overlay.classList.add('visible'), 100);
}

/**
 * Manual trigger for checking updates from the UI
 */
window.manualCheckForUpdate = async function() {
  if (!('serviceWorker' in navigator)) return;
  
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    // Show a small loading state/toast if you have one, or just update
    console.log('🔍 Manual update check initiated...');
    await reg.update();

    // Give it a moment to detect and then notify if no update found
    setTimeout(() => {
      if (!reg.waiting && !reg.installing && !document.getElementById('pwa-update-modal')) {
        showStatusToast('✨ Your NexTrack is up to date!', 'info');
      }
    }, 2000);
  } catch (err) {
    console.log('❌ Manual update check failed:', err);
  }
};

/**
 * Small helper for status feedback
 */
function showStatusToast(message, type) {
  if (document.getElementById('status-toast')) return;
  
  const toast = document.createElement('div');
  toast.id = 'status-toast';
  toast.className = 'status-toast-premium';
  toast.innerHTML = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// ── PWA Installation Handlers ──────

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Make the install button visible if it exists
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.style.display = 'none';
});

window.installNexTrack = function() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    alert('📱 To install NexTrack on iPhone/iPad:\n\n1. Tap the "Share" button at the bottom.\n2. Scroll down and tap "Add to Home Screen".\n3. Tap "Add" at the top right.');
    return;
  }
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => deferredPrompt = null);
  } else {
    alert('🌐 To install NexTrack:\n\n1. Open your browser menu (⋮).\n2. Look for "Install App" or "Add to Home Screen".');
  }
};

function initPWAAndTheme() {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.style.display = 'none';
  }

  // ── Inject Theme Toggle Globally ──────
  if (!document.getElementById('theme-toggle')) {
    const btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.className = 'theme-toggle';
    const isLight = document.documentElement.classList.contains('light-theme');
    btn.textContent = isLight ? '🌙' : '☀️';
    
    btn.onclick = () => {
      document.documentElement.classList.toggle('light-theme');
      const nowLight = document.documentElement.classList.contains('light-theme');
      btn.textContent = nowLight ? '🌙' : '☀️';
      
      // Update meta tag
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', nowLight ? '#ffffff' : '#1a1a2e');
      }
      
      localStorage.setItem('nexTrackTheme', nowLight ? 'light' : 'dark');
      if (typeof renderTodayHistory === 'function') renderTodayHistory();
    };
    document.body.appendChild(btn);
  }

  // ── Firebase Real-Time Update Listener ──────
  if (typeof firebaseDB !== 'undefined') {
    let initialVersionLoad = true;
    firebaseDB.ref('system/app_version').on('value', (snap) => {
      const v = snap.val();
      
      if (initialVersionLoad) {
        initialVersionLoad = false;
        // Record initial version if it exists
        if (v) localStorage.setItem('nexTrack_app_version', v);
      } else {
        if (!v) return; // ignore nulls on subsequent updates
        const storedV = localStorage.getItem('nexTrack_app_version');
        if (storedV !== v) {
          localStorage.setItem('nexTrack_app_version', v);
          console.log('🚀 Real-time update detected! Version:', v);
          // Show the premium modal
          if (typeof showPremiumUpdateModal === 'function') {
            showPremiumUpdateModal(null);
          }
        }
      }
    });
  }
}

// Automatically init if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWAAndTheme);
} else {
  initPWAAndTheme();
}
