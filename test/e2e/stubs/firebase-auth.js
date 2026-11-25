const user = { uid: "u-test", isAnonymous: true, displayName: null, email: null };
let listeners = [];
export const getAuth = () => ({ currentUser: user });
export const onAuthStateChanged = (auth, cb) => { setTimeout(() => cb(user), 20); return () => {}; };
export const signInAnonymously = async () => ({ user });
export class GoogleAuthProvider { static credentialFromError() { return null; } }
export const signInWithPopup = async () => ({ user });
export const linkWithPopup = async () => { Object.assign(user, { isAnonymous: false, displayName: "Test User", email: "t@example.com" }); return { user }; };
export const signInWithCredential = async () => ({ user });
export const signOut = async () => {};
