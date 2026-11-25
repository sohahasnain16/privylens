/**
 * PrivyLens — Firebase project settings (these values are not secrets; they ship to every browser).
 * Security comes from App Check + Firestore rules + API-key restrictions.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyAQizJ1XM9Apooea0WJPKO07-yEh4vKB_g",
  authDomain: "privylens-3fd85.firebaseapp.com",
  projectId: "privylens-3fd85",
  storageBucket: "privylens-3fd85.firebasestorage.app",
  messagingSenderId: "563531189327",
  appId: "1:563531189327:web:224f974f67364b169eae3a",
};

export const appCheckConfig = {
  provider: "recaptcha-v3", // "recaptcha-v3" | "recaptcha-enterprise"
  siteKey: "YOUR_RECAPTCHA_SITE_KEY", // paste the reCAPTCHA v3 site key once you create it
  // Debug token for judges / local dev. Register this exact value in Firebase console:
  // App Check -> Apps -> your web app -> menu -> "Manage debug tokens". Revoke it after the contest.
  debugToken: "ee93a841-c38e-4114-a5cf-164d912be2f7",
};

export const runtimeConfig = {
  rcMinFetchMs: 5 * 60 * 1000, // Remote Config fetch throttle; set 0 while demoing policy changes
};
