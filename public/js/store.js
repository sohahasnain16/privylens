/**
 * PrivyLens — Firestore: the user's private library + "Privacy Ledger".
 *
 * Privacy by design: we store the *explanation* (never the raw document text,
 * never images). Rules in firestore.rules enforce that server-side too.
 * Persistent local cache makes the library readable and writable offline.
 */
import {
  collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, setDoc, increment, deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase.js";

const analysesCol = (uid) => collection(db, "users", uid, "analyses");
const ledgerDoc = (uid) => doc(db, "users", uid, "stats", "privacy");

export function saveAnalysis(uid, record) {
  return addDoc(analysesCol(uid), {
    title: record.title,
    docType: record.docType,
    language: record.language,
    route: record.route,
    sources: record.sources,
    redactedCount: record.redactedCount,
    result: record.result,
    schemaVersion: 1,
    createdAt: serverTimestamp(),
  });
}

export function watchLibrary(uid, callback, onError) {
  const q = query(analysesCol(uid), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export const deleteAnalysis = (uid, id) => deleteDoc(doc(db, "users", uid, "analyses", id));

/** Atomic counters — how often did we keep a document on the device vs. use the cloud? */
export function recordRun(uid, { sources, redactedCount }) {
  const onDevice = sources.includes("on_device") ? 1 : 0;
  const cloud = sources.includes("in_cloud") ? 1 : 0;
  return setDoc(
    ledgerDoc(uid),
    { runs: increment(1), onDevice: increment(onDevice), cloud: increment(cloud), masked: increment(redactedCount || 0), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function watchLedger(uid, callback, onError) {
  return onSnapshot(ledgerDoc(uid), (s) => callback(s.exists() ? s.data() : { runs: 0, onDevice: 0, cloud: 0, masked: 0 }), onError);
}
