/**
 * PrivyLens — routing policy from Firebase Remote Config.
 *
 * Everything that decides *where* a document may be read is tunable without
 * shipping a new build: supported on-device languages, size limits, a
 * kill-switch (`force_mode`), the cloud fallback model, Nano sampling…
 */
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { rc, configured } from "./firebase.js";
import { DEFAULT_POLICY } from "./router.js";

const D = DEFAULT_POLICY;

export const RC_DEFAULTS = {
  ondevice_languages: D.onDeviceLanguages.join(","),
  max_ondevice_chars: D.maxOnDeviceChars,
  chunk_chars: D.chunkChars,
  max_chunked_chars: D.maxChunkedChars,
  force_mode: D.forceMode,
  pii_redaction: D.redactionEnabled,
  images_enabled: D.imagesEnabled,
  cloud_model: D.cloudModel,
  nano_temperature: D.temperature,
  nano_top_k: D.topK,
};

if (rc) rc.defaultConfig = RC_DEFAULTS;

const num = (key, fallback) => {
  const v = Number(getValue(rc, key).asNumber());
  return Number.isFinite(v) ? v : fallback;
};

export function readPolicy() {
  if (!rc) return { ...D };
  const langs = getValue(rc, "ondevice_languages").asString().split(",").map((s) => s.trim()).filter(Boolean);
  return {
    onDeviceLanguages: langs.length ? langs : [...D.onDeviceLanguages],
    maxOnDeviceChars: num("max_ondevice_chars", D.maxOnDeviceChars),
    chunkChars: num("chunk_chars", D.chunkChars),
    maxChunkedChars: num("max_chunked_chars", D.maxChunkedChars),
    forceMode: getValue(rc, "force_mode").asString().trim(),
    redactionEnabled: getValue(rc, "pii_redaction").asBoolean(),
    imagesEnabled: getValue(rc, "images_enabled").asBoolean(),
    cloudModel: getValue(rc, "cloud_model").asString().trim() || D.cloudModel,
    temperature: num("nano_temperature", D.temperature),
    topK: num("nano_top_k", D.topK),
  };
}

/** "remote" once a fetch succeeded, otherwise "default". Shown in Settings so judges can see it work. */
export function policySource() {
  if (!rc) return "default";
  try { return getValue(rc, "force_mode").getSource(); } catch { return "default"; }
}

export async function refreshPolicy() {
  if (rc && configured) {
    try {
      await fetchAndActivate(rc);
    } catch (e) {
      console.info("[policy] using cached/default Remote Config:", e?.code || e?.message);
    }
  }
  return readPolicy();
}
