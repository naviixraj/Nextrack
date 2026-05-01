/**
 * pwa-v32.js - Unified NexTrack Progressive Web App Handler
 * Manages service worker registration and platform-specific installation prompts.
 * This version (v32) removes the infinite refresh loop 'controllerchange' event.
 */

let deferredPrompt;
const APP_VERSION = 'v33';

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

/**
 * Shows the premium glassmorphism update modal
 */
window.showPremiumUpdateModal = function(worker) {
  if (document.getElementById('pwa-update-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pwa-update-modal';
  overlay.className = 'update-overlay';
  overlay.innerHTML = `
    <div class="update-modal glass">
      <div class="update-icon">🚀</div>
      <h2 class="update-title">New Version Available</h2>
      <p class="update-desc">A premium update from <strong>Team Titans</strong> is ready. We've optimized performance and added new visual features.</p>
      
      <div style="background:rgba(255,255,255,0.03); border-radius:16px; padding:1rem; margin-bottom:1.5rem; text-align:left; border:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:0.4rem;">What's New</div>
        <ul style="font-size:0.82rem; color:var(--text-secondary); padding-left:1.2rem; margin:0;">
          <li>Premium "Titans" Startup Loader</li>
          <li>Global Year-Wise Student Filtering</li>
          <li>Advanced Contextual Admin Menu</li>
        </ul>
      </div>

      <button class="update-btn" id="pwa-refresh-btn">🚀 Update & Experience</button>
      <button class="btn btn-ghost" onclick="document.getElementById('pwa-update-modal').remove()" style="margin-top:1rem; width:100%; font-size:0.8rem; opacity:0.6;">Maybe Later</button>
      
      <div style="margin-top:2rem; font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:2px; font-weight:700;">Powered by Team Titans</div>
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
  // Create a "Checking..." toast/popup
  const statusEl = document.createElement('div');
  statusEl.className = 'status-toast-premium visible';
  statusEl.innerHTML = `
    <div class="status-toast-content">
      <div class="status-toast-spinner"></div>
      <span>Checking for updates...</span>
    </div>
  `;
  document.body.appendChild(statusEl);

  if (!('serviceWorker' in navigator)) {
    setTimeout(() => {
      statusEl.querySelector('span').textContent = 'PWA not supported on this browser.';
      setTimeout(() => statusEl.remove(), 2000);
    }, 1000);
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      setTimeout(() => {
        if (reg.waiting || reg.installing) {
          statusEl.remove();
          showPremiumUpdateModal(reg.waiting || reg.installing);
        } else {
          statusEl.innerHTML = `
            <div class="status-toast-content">
              <span style="color:#4ade80;">🚀 You are on the latest version</span>
            </div>
          `;
          setTimeout(() => statusEl.remove(), 2500);
        }
      }, 1200);
    } else {
      statusEl.remove();
    }
  } catch (err) {
    statusEl.remove();
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

window.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.style.display = 'none';
  }
});
