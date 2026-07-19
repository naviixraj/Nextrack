# NexTrack - Student Movement Tracking System

A modern, progressive web application for tracking student movement in hostels with secure login, real-time analytics, and geofencing capabilities.

## 📋 Project Overview

**NexTrack** is an enterprise-level student movement tracking system designed for hostel management. It provides secure authentication, real-time data synchronization, and role-based dashboards for both students and administrators.

### Latest Update
- ✨ Fresh landing-page experience with a clearer startup flow and updated release messaging
- 📱 Improved mobile install guidance and PWA-friendly updates
- 🔐 Stronger user-facing status and smoother sign-in/register experience
- 🧭 Better alignment of the admin and student experience around the newest release

### Key Features
- 🔐 **Secure Authentication** - Email-based login and registration
- 📱 **Progressive Web App (PWA)** - Works offline with service worker support
- 📊 **Real-time Analytics** - Live student movement tracking
- 👥 **Dual Dashboard** - Separate interfaces for students and admins
- 🗺️ **Geofencing** - Smart location-based check-in/check-out system
- ☁️ **Cloud Sync** - Firebase real-time database integration
- 📧 **Email Notifications** - EmailJS integration for alerts

---

## 🏗️ Project Structure

```
NEXTRACK LIVE/
├── index.html              # Login & Registration Portal
├── admin.html              # Admin Dashboard
├── student.html            # Student Dashboard
├── manifest.json           # PWA Manifest Configuration
├── firebase.json           # Firebase Hosting Configuration
├── database.rules.json     # Firebase Security Rules
├── sw.js                   # Service Worker (Offline Support)
├── version.json            # App Version Info
├── css/
│   └── style.css           # Global Styles & Themes
└── js/
    ├── firebase-config.js  # Firebase Initialization & Config
    ├── auth.js             # Authentication Logic
    ├── admin.js            # Admin Dashboard Functions
    ├── student.js          # Student Dashboard Functions
    ├── data.js             # Data Management & API Calls
    └── pwa-v32.js          # PWA & Service Worker Controller
```

---

## 🔧 Technical Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Firebase Realtime Database |
| **Authentication** | Firebase Auth |
| **Email** | EmailJS |
| **Hosting** | Firebase Hosting |
| **PWA** | Service Worker, Web Manifest |
| **Icons** | PNG (192x192, 512x512) |

---

## 📁 File Descriptions

### HTML Pages
- **index.html** - Main login page with registration and password recovery
  - Title: "NexTrack | Student Movement Tracker"
  - Features: Secure login portal for hostel students

- **admin.html** - Admin dashboard for monitoring
  - Title: "NexTrack — Admin Dashboard"
  - Features: Student movement analytics and account management

- **student.html** - Student dashboard
  - Title: "NexTrack — Student Dashboard"
  - Features: Check-in/check-out functionality

### Configuration Files
- **manifest.json** - PWA configuration
  - App name: "NexTrack Student Movement"
  - Standalone mode for app-like experience
  - Icons for home screen installation

- **firebase.json** - Firebase hosting setup
  - Database rules configuration
  - Hosting settings with cache control
  - Caching strategy: no-cache for HTML

- **database.rules.json** - Firestore security rules

### JavaScript Modules

#### firebase-config.js
Firebase initialization with:
- Anonymous authentication for security
- Real-time database connection
- Connection status monitoring

**Firebase Project:** `nextrack-34110`
**Database Region:** Asia Southeast 1

#### auth.js
Authentication management:
- Login and registration workflows
- Forgot password functionality
- Session management
- EmailJS for email notifications
- Auto-redirect for existing sessions

#### admin.js
Admin panel functionality:
- Student movement monitoring
- Analytics and reporting
- Account management

#### student.js
Student interface:
- Check-in/check-out tracking
- Movement history
- Notifications

#### data.js
Data management:
- API calls to Firebase
- Data synchronization
- Real-time updates

#### pwa-v32.js
PWA functionality:
- Service worker registration
- Offline support
- Cache management

### Styling
- **css/style.css** - Complete UI styling
  - CSS custom properties (variables) for theming
  - Dark theme optimization
  - Responsive design
  - Modern gradient effects

### Other Files
- **sw.js** - Service worker for offline functionality
- **version.json** - Version tracking
- **icon-192.png, icon-512.png** - App icons for PWA

---

## 🚀 Getting Started

### Prerequisites
- Modern web browser with JavaScript enabled
- Internet connection for Firebase sync
- Email for account creation

### Installation

1. **Clone or Download Repository**
   ```bash
   git clone <repository-url>
   cd nexnavi
   ```

2. **Open in Browser**
   - Local: Open `index.html` directly in browser
   - Production: Deploy to Firebase Hosting

3. **Firebase Setup**
   - Project: `nextrack-34110`
   - Database already configured
   - Auth and rules pre-configured

### Deployment to Firebase

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy
firebase deploy
```

---

## 🔐 Security Features

- ✅ Anonymous Firebase authentication
- ✅ Secure email-based login
- ✅ Password recovery via EmailJS
- ✅ Geofencing for location verification
- ✅ Database security rules
- ✅ Cache-control headers for sensitive content
- ✅ HTTPS enforcement on hosting

---

## 📱 Progressive Web App (PWA)

NexTrack works as a standalone app:
- **Install on Home Screen** - Add to device home screen
- **Offline Support** - Service worker enables offline functionality
- **App-Like Experience** - Full screen mode without browser UI
- **Fast Loading** - Pre-cached assets and optimized caching

---

## 🎨 Theme & Styling

**Color Palette:**
- Primary Accent: `#6c63ff` (Purple)
- Secondary: `#a855f7` (Violet)
- Tertiary: `#06b6d4` (Cyan)
- Background: `#0d0d1a` (Dark)
- Text: `#e2e8f0` (Light)

**Typography:** Inter font family (300-800 weights)

---

## 🗄️ Firebase Integration

### Database Structure
- Real-time synchronization with Firestore
- User authentication via Firebase Auth
- Anonymous sign-in for security layer

### Environment
- **Project ID:** nextrack-34110
- **Database URL:** https://nextrack-34110-default-rtdb.asia-southeast1.firebasedatabase.app
- **Region:** Asia Southeast 1

---

## ⚙️ Configuration

### EmailJS Setup
- Service configured for email notifications
- Used for: Login notifications, password recovery, admin alerts
- Init ID: `FZBvXpRsuwPKew5dH`

### Version Management
- Current version tracked in `version.json`
- Cache busting via query parameters (e.g., `?v=89`)

---

## 📊 User Roles

### Student
- Check-in/Check-out management
- View personal movement history
- Receive notifications
- Mobile-friendly interface

### Admin
- Monitor all student movements
- View analytics and reports
- Manage accounts and permissions
- Export data for analysis

---

## 🐛 Troubleshooting

### Firebase Connection Issues
- Check internet connection
- Verify Firebase project configuration
- Check browser console for errors

### PWA Not Working
- Enable cookies and storage
- Check service worker status in DevTools
- Clear cache and reinstall

### Authentication Fails
- Verify email format
- Check password requirements
- Test anonymous auth in console

---

## 📝 Development Notes

### Version Updates
Update `version.json` when deploying new versions to ensure cache invalidation.

### Cache Busting
Assets use query parameters (`?v=XX`) for cache control. Increment version numbers when updating CSS, JavaScript, or images.

### Responsive Design
The app is fully responsive:
- Mobile (320px+)
- Tablet (768px+)
- Desktop (1024px+)

---

## 🤝 Contributing

When modifying the project:
1. Test on multiple devices and browsers
2. Update version numbers for cache invalidation
3. Ensure PWA functionality remains intact
4. Test offline functionality with service worker

---

## 📄 License

Proprietary - Team Titans & NexTrack

---

## 👥 Team

**Project:** Team Titans  
**Branding:** NexTrack - Enterprise Intelligence  
**Status:** Production Ready

---

## 🔗 Links

- **Firebase Console:** https://console.firebase.google.com/
- **Hosting:** https://nextrack-34110.firebaseapp.com
- **Documentation:** See individual file headers for code documentation

---

## 📞 Support

For issues or questions about the NexTrack system, please contact the development team.

**Last Updated:** 2026-07-15
