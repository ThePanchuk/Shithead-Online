// ─── Shithead · Firebase Configuration ───────────────────────────────────────
//
//  Uses the same Firebase project as thepanchuk.com
//
//  ONE-TIME SETUP (only needed once per Firebase project):
//  1. Open https://console.firebase.google.com/project/gen-lang-client-0590578277
//  2. Build → Firestore Database → Create database
//     → Start in "test mode" → choose a region → Done
//  3. Firestore → Rules → paste these rules and Publish:
//
//       rules_version = '2';
//       service cloud.firestore {
//         match /databases/{database}/documents {
//           match /rooms/{roomId} {
//             allow read, write: if true;
//           }
//         }
//       }
//
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const cfg = {
    apiKey:            'AIzaSyBkqD_O-p6otKVUibffSb1m6g7XtlnLae4',
    authDomain:        'claude-cd59e.firebaseapp.com',
    projectId:         'claude-cd59e',
    storageBucket:     'claude-cd59e.firebasestorage.app',
    messagingSenderId: '424910660038',
    appId:             '1:424910660038:web:8b79581d9b06e3e3d912c7'
  };

  if (!firebase.apps.length) firebase.initializeApp(cfg);
  window.db = firebase.firestore();
})();
