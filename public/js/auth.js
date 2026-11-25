/**
 * PrivyLens — Firebase Authentication.
 * Everyone starts as an anonymous user (zero friction for judges); "Sign in with
 * Google" upgrades the same account via account linking, so the library is kept.
 */
import {
  onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithPopup, linkWithPopup,
  signInWithCredential, signOut,
} from "firebase/auth";
import { auth, configured } from "./firebase.js";

export function watchUser(callback) {
  if (!configured) { callback(null, new Error("Firebase is not configured")); return () => {}; }
  return onAuthStateChanged(auth, async (user) => {
    if (user) return callback(user);
    try {
      await signInAnonymously(auth); // triggers this listener again with the new user
    } catch (e) {
      callback(null, e);
    }
  });
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      return await linkWithPopup(current, provider);
    } catch (e) {
      if (e.code === "auth/credential-already-in-use") {
        const cred = GoogleAuthProvider.credentialFromError(e);
        if (cred) return signInWithCredential(auth, cred);
      }
      throw e;
    }
  }
  return signInWithPopup(auth, provider);
}

export const logOut = () => signOut(auth);
