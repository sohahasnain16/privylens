/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PrivyLens — your Firebase project settings
 *
 *  1. Firebase console → Project settings → "Your apps" → Web app → copy config.
 *  2. Firebase console → Build → App Check → register this web app (reCAPTCHA v3
 *     or Enterprise) and paste the *site key* below. Enforce App Check for
 *     "Firebase AI Logic" (required by the contest) and for Firestore.
 *  3. For judging / local dev register a DEBUG TOKEN (App Check → Apps → ⋮ →
 *     Manage debug tokens) and paste it in `debugToken`. On localhost a token is
 *     auto-generated and printed in the browser console if you leave it empty.
 *
 *  These values are NOT secrets (they ship to every browser). Security comes
 *  from App Check + Firestore rules + API-key restrictions, not from hiding them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

export const appCheckConfig = {
  provider: "recaptcha-v3", // "recaptcha-v3" | "recaptcha-enterprise"
  siteKey: "YOUR_RECAPTCHA_SITE_KEY",
  debugToken: "", // paste a registered debug token string for judges / CI (leave "" in production)
};

export const runtimeConfig = {
  rcMinFetchMs: 5 * 60 * 1000, // Remote Config fetch throttle; set 0 while demoing policy changes
};
