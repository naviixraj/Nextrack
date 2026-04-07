/**
 * pwa-v32.js - Unified NexTrack Progressive Web App Handler
 * Manages service worker registration and platform-specific installation prompts.
 * This version (v32) removes the infinite refresh loop 'controllerchange' event.
 */

let deferredPrompt;
const APP_VERSION = 'v57';

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
    <div class="update-modal">
      <div class="update-icon">🚀</div>
      <h2 class="update-title">Feature Update</h2>
      <p class="update-desc">We've added some powerful new features to NexTrack. Refresh now to experience the latest version.</p>
      <button class="update-btn" id="pwa-refresh-btn">Update Now</button>
      <button class="btn btn-ghost btn-small" onclick="document.getElementById('pwa-update-modal').remove()" style="margin-top:1.5rem; opacity:0.5; font-size:0.75rem;">Close Preview</button>
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

window.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.style.display = 'none';
  }
});
