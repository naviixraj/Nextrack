/**
 * 🛡️ Auth & Subscription Guardian (v102 — Billing lockout disabled for dev)
 * Enforces institution isolation.
 * Billing lockout is disabled until Razorpay live keys are configured.
 */

const AuthGuard = {
  async protect() {
    const session = getSession();
    
    // 1. Basic Auth Check
    if (!session || !session.collegeId) {
      console.warn('🚨 Unauthorized: No active session.');
      window.location.replace('index.html');
      return;
    }

    // 2. Multi-Tenant Sync Check
    if (!window.firebaseSyncReady) {
      try { await initCollegeSync(session.collegeId); } catch(e){}
    }

    // 3. Subscription check — DISABLED for development.
    // Uncomment the block below when Razorpay live keys are configured.
    /*
    const sub = JSON.parse(localStorage.getItem('smt_subscription') || '{}');
    if (sub.status === 'expired' && sub.expiryDate) {
      const now = new Date();
      const grace = new Date(sub.expiryDate);
      grace.setDate(grace.getDate() + 2);
      if (now > grace) {
        this.showBillingLockout();
      }
    }
    */
    console.log('🛡️ Auth Guard: Session valid, access granted.');
  },

  showBillingLockout() {
    const overlay = document.createElement('div');
    overlay.className = 'billing-lockout-overlay';
    overlay.innerHTML = `
      <div class="lockout-card">
        <div class="lockout-icon">🛑</div>
        <h2>Access Paused</h2>
        <p>Your subscription has expired or been paused.</p>
        <button class="btn btn-primary" onclick="NexBilling.triggerCheckout()">Pay ₹1,499 to Unlock</button>
        <button class="btn btn-ghost" onclick="logout()" style="margin-top:0.5rem;">Logout</button>
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
    const path = window.location.pathname;
    const isLogin = path.endsWith('index.html') || path === '/' || path.split('/').pop() === '';
    if (isLogin) return;
    AuthGuard.protect();
});
