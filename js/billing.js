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
        if (session && session.collegeId && typeof firebaseDB !== 'undefined' && firebaseDB !== null) {
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
    
    // 📧 Automated Email Notification
    const session = getSession();
    if (window.emailjs && session) {
      const templateParams = {
        to_email: "warden@institution.edu", // In production, pull this from the Admin's profile
        college_id: session.collegeId,
        payment_id: response.razorpay_payment_id,
        message: "Payment process complete. You just unlocked the features for next month."
      };

      emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams)
        .then(() => console.log('📧 Confirmation email sent.'))
        .catch((err) => console.error('📧 Email failed:', err));
    }

    document.body.innerHTML += `
      <div id="payment-wait-overlay" class="modal-overlay visible" style="z-index:1000000;">
        <div class="modal glass" style="text-align:center; padding:3rem;">
          <div class="spinner" style="margin:0 auto 1rem;"></div>
          <h3>Payment Successful!</h3>
          <p>Verifying your transaction... Your premium features are being unlocked.</p>
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
