/**
 * 🌍 i18n Translation Engine (v78)
 * Supports English and Hindi with robust Fallback logic.
 */

const I18N_DICTIONARY = {
  en: {
    APP_NAME: "NexTrack",
    LOGIN_TITLE: "Welcome Back",
    LOGIN_SUBTITLE: "Securely access your institution's hub",
    COLLEGE_ID: "College ID",
    REG_NO: "Registration No.",
    PASSWORD: "Password",
    SIGN_IN: "Sign In",
    CREATE_ACCOUNT: "Create Account",
    LANGUAGE: "Language",
    FULL_NAME: "Full Name",
    ROOM_NO: "Room No.",
    PHONE: "Phone Number",
    FORGOT_PWD: "Forgot Password?",
    TRIAL_MSG: "Institution trial active. Access ends in {days} days.",
    LOCKED_MSG: "Subscription Expired. Please contact Master Admin.",
    SCAN_SUCCESS: "Check-out Recorded!",
    SCAN_ERROR: "Invalid or Expired QR Code",
    OFFLINE_MSG: "You are offline. Data saved and will sync automatically."
  },
  hi: {
    APP_NAME: "नेक्सट्रैक",
    LOGIN_TITLE: "आपका स्वागत है",
    LOGIN_SUBTITLE: "अपने संस्थान के हब तक सुरक्षित रूप से पहुँचें",
    COLLEGE_ID: "कॉलेज आईडी",
    REG_NO: "पंजीकरण संख्या",
    PASSWORD: "पासवर्ड",
    SIGN_IN: "साइन इन करें",
    CREATE_ACCOUNT: "खाता बनाएँ",
    LANGUAGE: "भाषा",
    FULL_NAME: "पूरा नाम",
    ROOM_NO: "कमरा नंबर",
    PHONE: "फ़ोन नंबर",
    FORGOT_PWD: "पासवर्ड भूल गए?",
    SCAN_SUCCESS: "चेक-आउट दर्ज किया गया!",
    OFFLINE_MSG: "आप ऑफ़लाइन हैं। डेटा सहेज लिया गया है।"
  }
};

const NexI18n = {
  currentLang: localStorage.getItem('nextrack_lang') || 'en',

  /**
   * Translate a key with fallback and interpolation
   */
  t(key, params = {}) {
    const lang = this.currentLang;
    let text = (I18N_DICTIONARY[lang] && I18N_DICTIONARY[lang][key]) || I18N_DICTIONARY['en'][key] || key;
    
    // Interpolation (e.g., {days} -> 5)
    Object.keys(params).forEach(p => {
      text = text.replace(`{${p}}`, params[p]);
    });
    
    return text;
  },

  setLanguage(lang) {
    if (I18N_DICTIONARY[lang]) {
      this.currentLang = lang;
      localStorage.setItem('nextrack_lang', lang);
      // Trigger a global UI update if NexStore is used
      if (window.NexStore) NexStore.dispatch('LANGUAGE_CHANGED', lang);
      else window.location.reload();
    }
  }
};

window.t = (key, params) => NexI18n.t(key, params);
window.NexI18n = NexI18n;
