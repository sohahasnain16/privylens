/**
 * PrivyLens — the Privacy Router.
 *
 * Pure decision logic (no DOM, no Firebase) so it can be unit-tested with
 * `node --test`. It answers one question before every request:
 *
 *   "Where may this document be read, and in what form?"
 *
 * The answer is one of Firebase AI Logic's four inference modes plus
 * a few flags (redact PII first? split into chunks for Gemini Nano's small
 * context window?). Remote Config supplies the tunable policy.
 */

import { detectScript } from "./pii.js";

/** Values match the strings used by the Firebase AI Logic `InferenceMode` enum. */
export const MODE = Object.freeze({
  PREFER_ON_DEVICE: "prefer_on_device",
  ONLY_ON_DEVICE: "only_on_device",
  PREFER_IN_CLOUD: "prefer_in_cloud",
  ONLY_IN_CLOUD: "only_in_cloud",
});

const ALL_MODES = new Set(Object.values(MODE));

export const PRIVACY = Object.freeze({ STRICT: "strict", BALANCED: "balanced", OPEN: "open" });

/** Defaults — every value can be overridden from Firebase Remote Config. */
export const DEFAULT_POLICY = Object.freeze({
  onDeviceLanguages: ["en", "es", "ja"], // languages Chrome's on-device model supports
  maxOnDeviceChars: 12000, // single shot; Nano has a ~9k token window shared by prompt + answer
  chunkChars: 6000, // size of each map-step chunk
  maxChunkedChars: 60000, // above this we don't try on-device map-reduce
  forceMode: "", // kill-switch / A-B: "" | prefer_on_device | only_in_cloud | ...
  redactionEnabled: true,
  imagesEnabled: true,
  cloudModel: "gemini-3.5-flash-lite",
  temperature: 0.2,
  topK: 0, // 0 = leave Chrome's defaults alone; set both >0 from Remote Config to tune Nano
});

/** Output languages offered in the UI. `code` is a BCP-47 tag. */
export const LANGUAGES = [
  { code: "en", label: "English", promptName: "English" },
  { code: "ur", label: "اردو (Urdu)", promptName: "Urdu (Arabic script)" },
  {
    code: "ur-Latn",
    label: "Roman Urdu",
    promptName: "Roman Urdu (Urdu written in Latin letters, the way people text in Pakistan)",
  },
  { code: "es", label: "Español", promptName: "Spanish" },
  { code: "ja", label: "日本語", promptName: "Japanese" },
  { code: "hi", label: "हिन्दी", promptName: "Hindi" },
  { code: "ar", label: "العربية", promptName: "Arabic" },
];

export function languageInfo(code) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}

/** ~chars-per-token differs a lot by script; this is for display + sanity only. */
export function estimateTokens(text) {
  let ascii = 0;
  let other = 0;
  for (const ch of text) (ch.charCodeAt(0) < 128 ? ascii++ : other++);
  return Math.ceil(ascii / 3.8 + other / 1.4);
}

/** Which language does the *input* look like, for on-device support purposes? */
export function guessInputLanguage(text) {
  switch (detectScript(text)) {
    case "arabic": return "ur";
    case "cjk": return "ja";
    case "devanagari": return "hi";
    default: return "en"; // Latin script — Nano reads en/es the same way for our purposes
  }
}

/**
 * @typedef {Object} RouteContext
 * @property {string} text            document text (may be empty if only images)
 * @property {number} imageCount
 * @property {string} language        requested OUTPUT language code
 * @property {"strict"|"balanced"|"open"} privacy
 * @property {"available"|"downloadable"|"downloading"|"unavailable"} nano
 * @property {boolean} online
 * @property {{total:number, counts:object}} pii
 * @property {string[]} topics
 * @property {typeof DEFAULT_POLICY} policy
 */

/**
 * @typedef {Object} Decision
 * @property {"on-device"|"hybrid"|"cloud"|"blocked"} route
 * @property {string|null} mode        one of MODE.* (null when blocked)
 * @property {boolean} redact          mask PII before the text can leave the device
 * @property {boolean} chunked         use on-device map-reduce for long documents
 * @property {boolean} blocked
 * @property {boolean} sensitive
 * @property {string[]} reasons        why (shown to the user — no black boxes)
 */

/** @param {RouteContext} ctx @returns {Decision} */
export function decide(ctx) {
  const policy = { ...DEFAULT_POLICY, ...(ctx.policy || {}) };
  const chars = (ctx.text || "").length;
  const images = ctx.imageCount || 0;
  const piiTotal = ctx.pii?.total || 0;
  const topics = ctx.topics || [];
  const sensitive = piiTotal > 0 || topics.length > 0 || images > 0;
  const reasons = [];

  // ---- Can Gemini Nano handle this request at all? -------------------------
  const whyNot = [];
  if (ctx.nano === "unavailable") whyNot.push("Gemini Nano isn't available in this browser");
  const outOk = policy.onDeviceLanguages.includes(ctx.language);
  if (!outOk) whyNot.push(`the on-device model can't write ${languageInfo(ctx.language).label}`);
  const inLang = chars ? guessInputLanguage(ctx.text) : "en";
  if (!policy.onDeviceLanguages.includes(inLang)) whyNot.push("the document's script isn't supported on-device");
  if (images > 0 && !policy.imagesEnabled) whyNot.push("on-device image input is switched off by policy");
  const fitsSingle = chars <= policy.maxOnDeviceChars;
  const fitsChunked = chars <= policy.maxChunkedChars && images === 0;
  if (!fitsSingle && !fitsChunked) whyNot.push("the document is too long even for on-device chunking");
  const deviceCapable = whyNot.length === 0;
  const chunked = deviceCapable && !fitsSingle;

  const base = { sensitive, chunked, blocked: false, redact: false };
  const block = (why) => ({
    ...base, chunked: false, route: "blocked", mode: null, blocked: true,
    reasons: [...reasons, ...why],
  });
  const device = (mode, route) => ({ ...base, route, mode, redact: false, reasons });
  const cloud = (mode, route = "cloud") => ({
    // Only on-device-first modes may use map-reduce chunking (each step can still fall back).
    ...base, chunked: mode === MODE.PREFER_ON_DEVICE ? base.chunked : false, route, mode,
    // Anything that may reach the cloud (even through a silent fallback) gets masked first.
    redact: piiTotal > 0 && policy.redactionEnabled,
    reasons,
  });

  // ---- Offline: only the device can answer --------------------------------
  if (ctx.online === false) {
    reasons.push("You're offline — nothing can leave this device");
    return deviceCapable
      ? device(MODE.ONLY_ON_DEVICE, "on-device")
      : block([`Offline, and ${whyNot.join("; ")}`]);
  }

  // ---- Remote Config override (kill-switch / experiments) -----------------
  if (ALL_MODES.has(policy.forceMode)) {
    reasons.push(`Remote Config forces "${policy.forceMode}"`);
    if (policy.forceMode === MODE.ONLY_ON_DEVICE) {
      return deviceCapable ? device(MODE.ONLY_ON_DEVICE, "on-device") : block(whyNot);
    }
    if (images > 0 && ctx.privacy !== PRIVACY.OPEN && policy.forceMode !== MODE.PREFER_ON_DEVICE) {
      return block(["images never leave the device unless you choose Cloud-OK"]);
    }
    return cloud(policy.forceMode, policy.forceMode === MODE.PREFER_ON_DEVICE ? "hybrid" : "cloud");
  }

  // ---- Privacy levels ------------------------------------------------------
  if (ctx.privacy === PRIVACY.STRICT) {
    reasons.push("Strict: this document may only be read on your device");
    return deviceCapable ? device(MODE.ONLY_ON_DEVICE, "on-device") : block(whyNot);
  }

  if (ctx.privacy === PRIVACY.OPEN) {
    if (deviceCapable && fitsSingle) {
      reasons.push("Cloud-OK: on-device first (free + instant), cloud as fallback");
      return cloud(MODE.PREFER_ON_DEVICE, "hybrid");
    }
    reasons.push(...(whyNot.length ? [`Using the cloud because ${whyNot.join("; ")}`] : ["Long document — cloud handles it best"]));
    return cloud(deviceCapable ? MODE.PREFER_IN_CLOUD : MODE.ONLY_IN_CLOUD);
  }

  // Balanced (default)
  if (deviceCapable) {
    if (sensitive) {
      reasons.push(sensitiveWhy(piiTotal, topics, images));
      reasons.push("Pinned to on-device — no network path exists for this request");
      return device(MODE.ONLY_ON_DEVICE, "on-device");
    }
    reasons.push("Nothing sensitive found — on-device first, cloud only if Nano can't");
    return cloud(MODE.PREFER_ON_DEVICE, "hybrid");
  }
  if (images > 0) {
    return block([`Images stay on your device in Balanced mode, but ${whyNot.join("; ")}`]);
  }
  reasons.push(`The cloud is needed because ${whyNot.join("; ")}`);
  if (piiTotal > 0 && policy.redactionEnabled) reasons.push(`${piiTotal} private item${piiTotal > 1 ? "s" : ""} will be masked on-device first`);
  return cloud(MODE.ONLY_IN_CLOUD);
}

function sensitiveWhy(pii, topics, images) {
  const bits = [];
  if (pii) bits.push(`${pii} private identifier${pii > 1 ? "s" : ""}`);
  if (topics.length) bits.push(`${topics.join(" / ")} content`);
  if (images) bits.push("a photo");
  return `Sensitive: found ${bits.join(" + ")}`;
}

/**
 * When an on-device-only run fails at runtime, offer an explicit, user-approved
 * retry in the cloud — always with PII masked, never with images.
 * @param {Decision} d @param {RouteContext} ctx @returns {Decision|null}
 */
export function cloudFallback(d, ctx) {
  if (!ctx.online || (ctx.imageCount || 0) > 0) return null;
  const policy = { ...DEFAULT_POLICY, ...(ctx.policy || {}) };
  return {
    ...d, route: "cloud", mode: MODE.ONLY_IN_CLOUD, chunked: false, blocked: false,
    redact: (ctx.pii?.total || 0) > 0 && policy.redactionEnabled,
    reasons: [...d.reasons, "You approved a cloud retry (private items masked)"],
  };
}

// ---------------------------------------------------------------------------
// Text helpers for on-device map-reduce + lightweight retrieval
// ---------------------------------------------------------------------------

/** Split on paragraphs → sentences → hard cuts so every chunk is <= size. */
export function chunkText(text, size = 6000) {
  const chunks = [];
  let buf = "";
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ""; };
  const pieces = [];
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= size) { pieces.push(para); continue; }
    for (const sentence of para.split(/(?<=[.!?۔。])\s+/)) {
      if (sentence.length <= size) { pieces.push(sentence); continue; }
      for (let i = 0; i < sentence.length; i += size) pieces.push(sentence.slice(i, i + size));
    }
  }
  for (const p of pieces) {
    if (buf && buf.length + p.length + 2 > size) flush();
    buf += (buf ? "\n\n" : "") + p;
  }
  flush();
  return chunks;
}

const STOP = new Set("the a an and or of to in is are was were be been for on at by with from as that this it its what which who whom when where why how do does did can could should would will shall i you he she we they me my your our their about into than then them there here not no yes any all".split(" "));

/** Tiny keyword retriever — picks the k chunks that best match a question. */
export function selectRelevantChunks(chunks, question, k = 2) {
  const words = (question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((w) => !STOP.has(w));
  if (!words.length || chunks.length <= k) return chunks.slice(0, Math.max(k, 0) || chunks.length);
  const scored = chunks.map((c, i) => {
    const lower = c.toLowerCase();
    let score = 0;
    for (const w of words) {
      let idx = lower.indexOf(w);
      while (idx !== -1) { score++; idx = lower.indexOf(w, idx + w.length); }
    }
    return { i, score };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, k).sort((a, b) => a.i - b.i).map((s) => chunks[s.i]);
}
