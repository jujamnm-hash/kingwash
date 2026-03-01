// =====================================================
//  KING WASH — Firebase Configuration
//  پڕ بکەرەوە لە Firebase Console
//  https://console.firebase.google.com
// =====================================================
//
//  ستەپەکان:
//  1. بچۆ https://console.firebase.google.com
//  2. پرۆژەی نوێ دروست بکە (مەسەلەن: kingwash)
//  3. Firestore Database چالاک بکە (Start in test mode)
//  4. Project Settings → Your apps → Add app (Web) → config کۆپی بکە
//  5. ئەو بەهاوانەی خوارەوە لێرەدا جێگوڕبکە
//
window.FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
