/**
 * 💰 NexTrack Billing & Subscription Logic (v78)
 * Integrates Razorpay Checkout and handles institution status UI.
 */

const NexBilling = {
  // Replace with live key from Razorpay Dashboard in production
  RAZORPAY_KEY_ID: 'rzp_test_placeholder', 

  /**
   * Triggers the Razorpay checkout modal
   */
  triggerCheckout() {
    const session = getSession();
    if (!session || !session.collegeId) return;

    const options = {
      key: this.RAZORPAY_KEY_ID,
      amount: 20000, // Rs 200 in paise
      currency: "INR",
      name: "NexTrack SaaS",
      description: "Institution Subscription (1 Month)",
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

  /**
   * Handles successful payment callback
   */
  async handleSuccess(response) {
    NexUX.playSuccess();
    
    // 🛡️ Audit Log: Payment Successful
    NexSecurity.logAction('PAYMENT_SUCCESS', `Razorpay Payment ID: ${response.razorpay_payment_id}`);

    // Normally we wait for the webhook, but we can update the UI immediately
    // to give the user a 'premium' fast feel.
    const session = getSession();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const updateData = {
      status: 'active',
      expiryDate: expiryDate.toISOString(),
      lastPaymentId: response.razorpay_payment_id
    };

    // Update in firebase (database rules must allow this for test purposes, 
    // or we use a Cloud Function)
    await firebaseDB.ref(`colleges/${session.collegeId}/subscription`).update(updateData);
    
    alert('✅ Subscription Activated! Your institution is now premium.');
    window.location.reload();
  }
};

window.NexBilling = NexBilling;
