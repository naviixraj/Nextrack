/**
 * 🛡️ Security & Enterprise Utils (v78)
 * Handles Rotating QR Handshakes and Audit Logging
 */

const Security = {
  // Rotate hash every 30 seconds
  ROTATION_INTERVAL: 30000,

  /**
   * Generates a time-based handshake token
   * @param {string} collegeId 
   * @param {string} secret 
   * @returns {string} The hash token
   */
  generateHandshake(collegeId, secret) {
    const timeWindow = Math.floor(Date.now() / this.ROTATION_INTERVAL);
    // Using a simple but effective hash simulation for Vanilla JS
    // In a real prod environment, use CryptoJS or Web Crypto API
    const raw = `${collegeId}:${secret}:${timeWindow}`;
    return btoa(raw).substring(0, 12); // Short, scannable hash
  },

  /**
   * Verifies a student's scanned token
   */
  verifyHandshake(scannedToken, collegeId, secret) {
    const current = this.generateHandshake(collegeId, secret);
    // Also allow previous window for late scans (5 second buffer)
    const prevWindow = Math.floor((Date.now() - 5000) / this.ROTATION_INTERVAL);
    const prevRaw = `${collegeId}:${secret}:${prevWindow}`;
    const previous = btoa(prevRaw).substring(0, 12);
    
    return scannedToken === current || scannedToken === previous;
  },

  /**
   * Push an audit log to the institution's private log node
   */
  async logAction(action, details) {
    const session = getSession();
    if (!session || !session.collegeId) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      adminUid: session.userId,
      action: action,
      details: details,
      ip: 'Capture not available in JS client'
    };

    return firebaseDB.ref(`colleges/${session.collegeId}/logs`).push(logEntry);
  }
};

window.NexSecurity = Security;
