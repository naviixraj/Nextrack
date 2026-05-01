/**
 * ✨ Premium UX & Feedback Engine (v78)
 * Handles Haptics, Audio Chimes, and Skeleton Loaders.
 */

const NexUX = {
  /**
   * Triggers physical vibration feedback
   */
  vibrate(pattern = 100) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  },

  /**
   * Plays a subtle professional success chime
   */
  playSuccess() {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => { /* User interaction required for first play */ });
  },

  /**
   * Injects skeleton loaders into a container
   */
  showSkeletons(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const skeletonHTML = `
      <div class="skeleton-card">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-info">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line long"></div>
        </div>
      </div>
    `.repeat(count);
    
    container.innerHTML = skeletonHTML;
  },

  /**
   * Shows a premium glassmorphic toast notification
   */
  showToast(msg, isSuccess = true) {
    const toast = document.createElement('div');
    toast.className = 'status-toast-premium';
    toast.innerHTML = `
      <div class="status-toast-content">
        ${isSuccess ? '✅' : '⚠️'}
        <span>${msg}</span>
      </div>
    `;
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('visible'));
    
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 600);
    }, 3000);
  }
};

window.NexUX = NexUX;
