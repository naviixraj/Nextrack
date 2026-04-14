/**
 * 🛡️ Auth & Subscription Guardian (v78)
 * Enforces institution isolation and handles the 'Kill Switch'.
 */

const AuthGuard = {
  /**
   * Protects the current route based on session and subscription status.
   */
  async protect() {
    const session = getSession();
    
    // 1. Basic Auth Check
    if (!session || !session.collegeId) {
      console.warn('🚨 Unauthorized: No active session.');
      window.location.replace('index.html');
      return;
    }

    // 2. Multi-Tenant Sync Check
    // Ensure data.js has initialized listeners for this college
    if (!window.firebaseSyncReady) {
      initCollegeSync(session.collegeId);
    }

    // 3. Subscription 'Kill Switch' Check
    // We check the local cached subscription but the database rules will also block writes.
    const sub = JSON.parse(localStorage.getItem('smt_subscription') || '{}');
    const now = new Date();
    
    if (sub.expiryDate) {
      const expiry = new Date(sub.expiryDate);
      const grace = new Date(expiry);
      grace.setDate(grace.getDate() + 2); // 2-Day Grace Period
      
      if (now > grace) {
        console.error('🚫 Institution Paused: Subscription Expired.');
        this.showBillingLockout();
      } else if (now > expiry) {
        this.showGraceWarning();
      }
    }
  },

  showBillingLockout() {
    // Inject a full-screen billing overlay that cannot be dismissed
    const overlay = document.createElement('div');
    overlay.className = 'billing-lockout-overlay';
    overlay.innerHTML = `
      <div class="lockout-card">
        <div class="lockout-icon">💸</div>
        <h2>${t('LOCKED_MSG')}</h2>
        <p>Access for this institution has been paused. Please contact administration for payment (₹200/mo).</p>
        <button class="btn-primary" onclick="triggerRazorpay()">${t('SIGN_IN')}</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  },

  showGraceWarning() {
    const banner = document.createElement('div');
    banner.className = 'grace-warning-banner';
    banner.innerHTML = `⚠️ Service will be paused in 48 hours. Please renew your subscription.`;
    document.body.prepend(banner);
  }
};

// Auto-protect on load
document.addEventListener('DOMContentLoaded', () => {
    // Don't guard index.html
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') return;
    AuthGuard.protect();
});
