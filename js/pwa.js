/**
 * pwa.js - Unified NexTrack Progressive Web App Handler
 * Manages service worker registration and platform-specific installation prompts.
 */

let deferredPrompt;

// 1. Register Service Worker
const CURRENT_VERSION = 'v27';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 1. Check for aggressive version updates before registering
    checkServerVersion();

    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('🚀 NexTrack PWA Active!', reg.scope);
      
      // Check for updates periodically
      reg.update();

      // Listen for the waiting service worker (new version already installed)
      if (reg.waiting) {
        showPremiumUpdateModal(reg.waiting);
      }

      reg.onupdatefound = () => {
        const newWorker = reg.installing;
        newWorker.onstatechange = () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showPremiumUpdateModal(newWorker);
          }
        };
      };
    }).catch(err => console.log('❌ PWA Registration Error:', err));
  });

  // Reload when the new service worker takes over
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

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
    refreshBtn.addEventListener('click', () => {
      if (worker) {
        worker.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
      overlay.classList.remove('visible');
    });
  }

  // Show with minor delay for animation smoothness
  setTimeout(() => overlay.classList.add('visible'), 100);
}

// ── Version Guard (Mobile Cache Busting) ──────
async function checkServerVersion() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`);
    const data = await res.json();
    
    if (data.version !== CURRENT_VERSION) {
      console.log(`🔄 Version Mismatch! Current: ${CURRENT_VERSION}, Server: ${data.version}. Reloading...`);
      // Update local version tracking and force refresh
      if (typeof window.localStorage !== 'undefined') {
        localStorage.setItem('pwa_version', data.version);
      }
      window.location.reload();
    }
  } catch (err) {
    console.log('⚠️ Version check skipped:', err);
  }
}

// 2. Listen for the Android/Chrome Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Optionally update UI to notify the user they can install the PWA
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.style.display = 'inline-flex';
  
  console.log('✨ Install prompt detected and ready.');
});

// 3. Monitor if the app is successfully installed
window.addEventListener('appinstalled', (evt) => {
  console.log('✅ NexTrack was installed.');
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.style.display = 'none';
});

/**
 * Global function to handle installation across different platforms
 */
window.installNexTrack = function() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) {
    alert('✅ NexTrack is already installed on your device!');
    return;
  }

  if (isIOS) {
    // Custom guidance for iOS
    alert('📱 To install NexTrack on iPhone/iPad:\n\n1. Tap the "Share" button (the square with an arrow) at the bottom.\n2. Scroll down and tap "Add to Home Screen".\n3. Tap "Add" at the top right.');
    return;
  }

  if (deferredPrompt) {
    // Trigger the standard Chrome/Android install prompt
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the A2HS prompt');
      } else {
        console.log('User dismissed the A2HS prompt');
      }
      deferredPrompt = null;
    });
  } else {
    // Fallback for other browsers or if the prompt hasn't fired yet
    alert('🌐 To install NexTrack:\n\n1. Open your browser menu (usually three dots ⋮ or a gear icon).\n2. Look for "Install App" or "Add to Home Screen".');
  }
};

// Check for standalone mode on load
window.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.style.display = 'none';
    console.log('📱 Currently running in App Mode.');
  }
});
