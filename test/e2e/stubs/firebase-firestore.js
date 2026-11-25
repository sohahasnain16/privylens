// Tiny in-memory Firestore double (collections, docs, onSnapshot, increment).
const store = new Map();
const subs = new Map();
const notify = (path) => (subs.get(path) || []).forEach((f) => f());
window.__fs = store;
export const serverTimestamp = () => ({ toDate: () => new Date() });
export const increment = (n) => ({ __inc: n });
export const collection = (db, ...p) => ({ path: p.join("/"), kind: "col" });
export const doc = (db, ...p) => ({ path: p.join("/"), kind: "doc", id: p.at(-1) });
export const orderBy = () => ({}); export const limit = () => ({});
export const query = (col) => col;
export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
export const addDoc = async (col, data) => { const id = "d" + (store.size + 1); store.set(`${col.path}/${id}`, { ...data }); notify(col.path); return { id }; };
export const setDoc = async (ref, data) => {
  const cur = store.get(ref.path) || {};
  for (const [k, v] of Object.entries(data)) cur[k] = v && v.__inc !== undefined ? (cur[k] || 0) + v.__inc : v;
  store.set(ref.path, cur); notify(ref.path);
  notify(ref.path.split("/").slice(0, -1).join("/"));
};
export const deleteDoc = async (ref) => { store.delete(ref.path); notify(ref.path.split("/").slice(0, -1).join("/")); };
export const onSnapshot = (ref, cb) => {
  const fire = () => {
    if (ref.kind === "doc") { const d = store.get(ref.path); cb({ exists: () => !!d, data: () => d }); }
    else cb({ docs: [...store].filter(([k]) => k.startsWith(ref.path + "/") && !k.slice(ref.path.length + 1).includes("/")).map(([k, v]) => ({ id: k.split("/").pop(), data: () => v })) });
  };
  const arr = subs.get(ref.path) || []; arr.push(fire); subs.set(ref.path, arr); setTimeout(fire, 5); return () => {};
};
