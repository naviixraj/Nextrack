/**
 * pwa.js - Unified NexTrack Progressive Web App Handler
 * Manages service worker registration and platform-specific installation prompts.
 */

let deferredPrompt;

// 1. Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('🚀 NexTrack PWA Active!', reg.scope);
    }).catch(err => console.log('❌ PWA Registration Error:', err));
  });
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
