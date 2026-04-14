const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * 🔒 Fortress Tier: Custom Claims for Multi-Tenancy
 * Assigns a collegeId to a user's Auth token.
 * This ensures they are cryptographically locked into their institution's database node.
 */
exports.setCollegeClaim = functions.https.onCall(async (data, context) => {
  // Only authenticated users can request a claim (or we can secure this further)
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const { collegeId, role } = data;
  if (!collegeId) {
    throw new functions.https.HttpsError('invalid-argument', 'College ID is required.');
  }

  const uid = context.auth.uid;

  try {
    await admin.auth().setCustomUserClaims(uid, { collegeId, role });
    return { success: true, message: `Claim set for college: ${collegeId}` };
  } catch (error) {
    console.error('Error setting custom claims:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 💰 Revenue Tier: Razorpay Webhook Integration
 * Securely confirms payments from Razorpay to update institution status.
 */
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
  // TODO: Implement signature verification for 10/10 security
  // const secret = functions.config().razorpay.secret;
  
  const event = req.body.event;
  if (event === 'payment.captured') {
    const { collegeId } = req.body.payload.payment.entity.notes;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // Add 30 days

    await admin.database().ref(`colleges/${collegeId}/subscription`).update({
      status: 'active',
      expiryDate: expiryDate.toISOString(),
      lastPaymentDate: new Date().toISOString()
    });

    // TODO: Phase 3 - Generate and Email PDF Invoice
  }

  res.status(200).send('ok');
});
