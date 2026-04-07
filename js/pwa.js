/**
 * pwa.js - Unified NexTrack Progressive Web App Handler
 * Manages service worker registration and platform-specific installation prompts.
 */

let deferredPrompt;
const APP_VERSION = 'v31';

// 1. Register Service Worker with a Cache Buster
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Adding a timestamp ensures the browser always checks for the latest SW script
    navigator.serviceWorker.register(`sw.js?v=${Date.now()}`).then(reg => {
      console.log('🚀 PWA Active:', reg.scope);
      
      // Force an update check immediately
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

  // Reload when the new service worker takes over (after SKIP_WAITING)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
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
        // If we have a worker, wake it up to take control
        if (worker) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        } else {
          // Fallback: Hard reload with cache breaker
          const url = new URL(window.location.href);
          url.searchParams.set('upd', Date.now());
          window.location.replace(url.href);
        }
      } catch (err) {
        window.location.reload();
      }
    });
  }

  // Show with minor delay for animation smoothness
  setTimeout(() => overlay.classList.add('visible'), 100);
}

// ── PWA Installation Handlers ──────

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
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
