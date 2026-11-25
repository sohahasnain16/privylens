/**
 * PrivyLens — Firebase bootstrap.
 *
 * Order matters: App Check is initialised BEFORE any other Firebase product
 * so every request (AI Logic cloud calls, Firestore, Remote Config) carries an
 * App Check token. Firebase AI Logic requires App Check.
 *
 * `firebase/*` bare specifiers are resolved by the import map in index.html
 * (CDN, no build step). With npm you would install `firebase` and use the same
 * import lines unchanged.
 */
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from "firebase/firestore";
import { getRemoteConfig } from "firebase/remote-config";
import { firebaseConfig, appCheckConfig, runtimeConfig } from "../config.js";

const placeholder = (v) => !v || String(v).startsWith("YOUR_");

/** false until config.js has real values — the app then runs in "device only" demo mode. */
export const configured = !placeholder(firebaseConfig.apiKey) && !placeholder(firebaseConfig.projectId);

const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
// A registered debug token string always wins; on localhost fall back to an auto-generated one.
if (appCheckConfig.debugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckConfig.debugToken;
else if (isLocal) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

export const app = initializeApp(firebaseConfig);

export let appCheck = null;
try {
  if (configured && (!placeholder(appCheckConfig.siteKey) || self.FIREBASE_APPCHECK_DEBUG_TOKEN)) {
    const Provider = appCheckConfig.provider === "recaptcha-enterprise" ? ReCaptchaEnterpriseProvider : ReCaptchaV3Provider;
    appCheck = initializeAppCheck(app, {
      provider: new Provider(placeholder(appCheckConfig.siteKey) ? "debug-only" : appCheckConfig.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (configured) {
    console.warn("[PrivyLens] App Check is not configured — Firebase AI Logic cloud calls will be rejected if enforcement is on.");
  }
} catch (e) {
  console.warn("[PrivyLens] App Check init failed:", e);
}

/** Firebase AI Logic (Gemini Developer API backend). Hybrid on-device inference is configured per model in ai.js. */
export const ai = getAI(app, { backend: new GoogleAIBackend() });

export const auth = getAuth(app);

export const db = (() => {
  try {
    // Offline-first library: reads + queued writes work with the network off.
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app);
  }
})();

export let rc = null;
try {
  rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = runtimeConfig.rcMinFetchMs;
} catch (e) {
  console.warn("[PrivyLens] Remote Config unavailable:", e);
}
