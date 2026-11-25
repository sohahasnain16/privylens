import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLES } from "../public/js/samples.js";
import { detectPII, detectTopics } from "../public/js/pii.js";
import { decide, DEFAULT_POLICY, PRIVACY, MODE } from "../public/js/router.js";

const get = (id) => SAMPLES.find((s) => s.id === id);
const ctxFor = (s, over = {}) => ({
  text: s.text, imageCount: 0, language: s.language, privacy: PRIVACY.BALANCED, nano: "available", online: true,
  pii: detectPII(s.text), topics: detectTopics(s.text), policy: DEFAULT_POLICY, ...over,
});

test("rent sample has PII, is sensitive and is pinned on-device", () => {
  const c = ctxFor(get("rent"));
  assert.ok(c.pii.total >= 5, JSON.stringify(c.pii.counts));
  const d = decide(c);
  assert.equal(d.mode, MODE.ONLY_ON_DEVICE);
});

test("lab sample is medical", () => assert.ok(detectTopics(get("lab").text).includes("medical")));

test("scam sample finds CNIC, phone, e-mail", () => {
  const { counts } = detectPII(get("scam").text);
  assert.ok(counts.CNIC && counts.PHONE && counts.EMAIL, JSON.stringify(counts));
});

test("long sample really exceeds the single-shot window and chunks on-device", () => {
  const s = get("long");
  assert.ok(s.text.length > 12000, `length ${s.text.length}`);
  const d = decide(ctxFor(s));
  assert.equal(d.chunked, true);
  assert.equal(d.mode, MODE.ONLY_ON_DEVICE); // legal content is sensitive → pinned on-device, in chunks
  assert.ok(s.text.includes("renews automatically"));
});

test("Urdu sample goes to the cloud but is masked first", () => {
  const s = get("urdu");
  const c = ctxFor(s);
  assert.ok(c.pii.total >= 2, JSON.stringify(c.pii.counts));
  const d = decide(c);
  assert.equal(d.mode, MODE.ONLY_IN_CLOUD);
  assert.equal(d.redact, true);
});
