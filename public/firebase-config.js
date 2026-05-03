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
    apiKey:            'AIzaSyAlxnfgFWWVO4A8o11nCE8MMQuWHqErEEU',
    authDomain:        'gen-lang-client-0590578277.firebaseapp.com',
    projectId:         'gen-lang-client-0590578277',
    storageBucket:     'gen-lang-client-0590578277.firebasestorage.app',
    messagingSenderId: '586691852652',
    appId:             '1:586691852652:web:e4305b5efa71efdc83db49'
  };

  if (!firebase.apps.length) firebase.initializeApp(cfg);
  window.db = firebase.firestore();
})();
