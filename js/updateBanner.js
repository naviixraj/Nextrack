// updateBanner.js – Global update detection & premium banner
(function() {
  // Prevent re-definition if script is loaded multiple times
  if (typeof window.initGlobalUpdateListener === 'function') return;

  // Create and show the premium‑styled update banner
  function showUpdateBanner() {
    if (document.getElementById('global-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'global-update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span>🚀 <strong>New update available.</strong> Refresh to get the latest version.</span>
      <button class="update-btn">Update Now</button>
    `;
    document.body.appendChild(banner);
    // slide‑in animation
    requestAnimationFrame(() => banner.classList.add('visible'));
    const btn = banner.querySelector('.update-btn');
    btn.addEventListener('click', () => {
      banner.remove();
      // Hard refresh to reload latest resources from server
      window.location.reload(true);
    });
    // Auto‑dismiss after 30 s if ignored
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 30000);
  }

  // Initialize the Firebase listener that triggers the banner
  window.initGlobalUpdateListener = function() {
    if (typeof firebaseDB !== 'undefined' && firebaseDB) {
      firebaseDB.ref('globalUpdate').on('value', snap => {
        const ts = snap.val();
        if (!ts) return;
        const lastSeen = localStorage.getItem('lastSeenGlobalUpdate');
        if (!lastSeen || ts > lastSeen) {
          showUpdateBanner();
          localStorage.setItem('lastSeenGlobalUpdate', ts);
        }
      });
    }
  };
})();
