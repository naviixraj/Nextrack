/**
 * 💰 NexTrack Billing & Subscription Logic (v102 — TEST MODE)
 * ⚠️ TEST MODE: All features unlocked. No payments required.
 * Switch to production by replacing RAZORPAY_KEY_ID with your live key
 * and setting TEST_MODE to false.
 */

const NexBilling = {
  TEST_MODE: true,  // 🔥 Set to false for production
  RAZORPAY_KEY_ID: 'rzp_test_placeholder', 

  triggerCheckout() {
    if (this.TEST_MODE) {
      alert('✅ TEST MODE: Unlocking dashboard for free testing!');
      
      // Wipe the broken local storage that's causing the loop
      localStorage.removeItem('smt_subscription');
      
      // Attempt to heal the cloud data too
      try {
        const session = getSession();
        if (session && session.collegeId && window.firebaseDB) {
          firebaseDB.ref(`colleges/${session.collegeId}/subscription`).set({
            status: 'trial',
            plan: 'pro'
          });
        }
      } catch(e) {}

      // Hard-remove the overlay if it exists
      const overlay = document.querySelector('.billing-lockout-overlay');
      if (overlay) overlay.remove();
      document.body.style.overflow = '';
      
      // Force reload to apply clean state
      window.location.reload();
      return;
    }

    const session = getSession();
    if (!session || !session.collegeId) return;

    const options = {
      key: this.RAZORPAY_KEY_ID,
      amount: 149900,
      currency: "INR",
      name: "NexTrack SaaS",
      description: "College Pro Subscription (Monthly)",
      image: "logo nex.jpeg",
      handler: function (response) {
        NexBilling.handleSuccess(response);
      },
      prefill: {
        name: session.userId,
        email: "warden@institution.edu"
      },
      notes: {
        collegeId: session.collegeId
      },
      theme: {
        color: "#6366f1"
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();
  },

  async handleSuccess(response) {
    if (window.NexUX) NexUX.playSuccess();
    if (window.NexSecurity) NexSecurity.logAction('PAYMENT_SUCCESS', `Razorpay Payment ID: ${response.razorpay_payment_id}`);
    
    document.body.innerHTML += `
      <div id="payment-wait-overlay" class="modal-overlay visible" style="z-index:1000000;">
        <div class="modal glass" style="text-align:center; padding:3rem;">
          <div class="spinner" style="margin:0 auto 1rem;"></div>
          <h3>Payment Successful!</h3>
          <p>Verifying your transaction...</p>
        </div>
      </div>
    `;
    setTimeout(() => window.location.reload(), 6000);
  },

  /**
   * Returns the current subscription status for UI display.
   * In TEST_MODE, always returns 'trial' (unlimited access).
   */
  getStatus() {
    if (this.TEST_MODE) return 'trial';
    const sub = JSON.parse(localStorage.getItem('smt_subscription') || '{}');
    return sub.status || 'trial';
  }
};

window.NexBilling = NexBilling;
