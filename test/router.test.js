import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, MODE, PRIVACY, DEFAULT_POLICY, chunkText, selectRelevantChunks, cloudFallback, estimateTokens } from "../public/js/router.js";

const base = {
  text: "short english text",
  imageCount: 0,
  language: "en",
  privacy: PRIVACY.BALANCED,
  nano: "available",
  online: true,
  pii: { total: 0, counts: {} },
  topics: [],
  policy: DEFAULT_POLICY,
};
const d = (over) => decide({ ...base, ...over });

test("balanced + nothing sensitive → hybrid, on-device first", () => {
  const r = d({});
  assert.equal(r.mode, MODE.PREFER_ON_DEVICE);
  assert.equal(r.route, "hybrid");
  assert.equal(r.redact, false);
});

test("balanced + PII → pinned to ONLY_ON_DEVICE, original text stays raw", () => {
  const r = d({ pii: { total: 2, counts: { CNIC: 1, PHONE: 1 } } });
  assert.equal(r.mode, MODE.ONLY_ON_DEVICE);
  assert.equal(r.route, "on-device");
  assert.equal(r.redact, false);
  assert.ok(r.sensitive);
});

test("balanced + PII + Urdu output → cloud, but PII is masked first", () => {
  const r = d({ language: "ur", pii: { total: 1, counts: { CNIC: 1 } } });
  assert.equal(r.mode, MODE.ONLY_IN_CLOUD);
  assert.equal(r.redact, true);
  assert.match(r.reasons.join(" "), /masked/);
});

test("Nano unavailable + sensitive → cloud with masking", () => {
  const r = d({ nano: "unavailable", pii: { total: 1, counts: { CARD: 1 } } });
  assert.equal(r.mode, MODE.ONLY_IN_CLOUD);
  assert.equal(r.redact, true);
});

test("strict never touches the cloud and blocks instead", () => {
  const ok = d({ privacy: PRIVACY.STRICT });
  assert.equal(ok.mode, MODE.ONLY_ON_DEVICE);
  const blocked = d({ privacy: PRIVACY.STRICT, language: "ur" });
  assert.ok(blocked.blocked);
  assert.equal(blocked.mode, null);
});

test("long documents use on-device map-reduce when they fit the chunk budget", () => {
  const r = d({ text: "x ".repeat(10000) }); // 20k chars > 12k
  assert.equal(r.chunked, true);
  assert.equal(r.mode, MODE.PREFER_ON_DEVICE);
  const huge = d({ text: "x ".repeat(40000) }); // 80k chars
  assert.equal(huge.chunked, false);
  assert.equal(huge.mode, MODE.ONLY_IN_CLOUD);
});

test("images never leave the device in balanced mode", () => {
  const r = d({ imageCount: 1, text: "" });
  assert.equal(r.mode, MODE.ONLY_ON_DEVICE);
  const b = d({ imageCount: 1, text: "", nano: "unavailable" });
  assert.ok(b.blocked);
  const open = d({ imageCount: 1, text: "", nano: "unavailable", privacy: PRIVACY.OPEN });
  assert.equal(open.mode, MODE.ONLY_IN_CLOUD);
});

test("offline forces on-device or blocks", () => {
  assert.equal(d({ online: false }).mode, MODE.ONLY_ON_DEVICE);
  assert.ok(d({ online: false, language: "ur" }).blocked);
});

test("Remote Config force_mode kill-switch overrides balanced, still masks PII", () => {
  const r = d({ policy: { ...DEFAULT_POLICY, forceMode: "only_in_cloud" }, pii: { total: 1, counts: { EMAIL: 1 } } });
  assert.equal(r.mode, MODE.ONLY_IN_CLOUD);
  assert.equal(r.redact, true);
  assert.match(r.reasons[0], /Remote Config/);
});

test("open mode: short → prefer on-device, with masking in case of silent fallback", () => {
  const r = d({ privacy: PRIVACY.OPEN, pii: { total: 1, counts: { PHONE: 1 } } });
  assert.equal(r.mode, MODE.PREFER_ON_DEVICE);
  assert.equal(r.redact, true);
});

test("cloudFallback is refused for images and offline, masks PII otherwise", () => {
  const first = d({ pii: { total: 1, counts: { CNIC: 1 } } });
  assert.equal(cloudFallback(first, { ...base, imageCount: 1 }), null);
  assert.equal(cloudFallback(first, { ...base, online: false }), null);
  const fb = cloudFallback(first, { ...base, pii: { total: 1 } });
  assert.equal(fb.mode, MODE.ONLY_IN_CLOUD);
  assert.equal(fb.redact, true);
});

test("chunkText respects the size limit and keeps all content", () => {
  const para = (n) => `Clause ${n}. ` + "word ".repeat(200);
  const text = Array.from({ length: 12 }, (_, i) => para(i)).join("\n\n");
  const chunks = chunkText(text, 3000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 3000));
  for (let i = 0; i < 12; i++) assert.ok(chunks.join("\n").includes(`Clause ${i}.`));
});

test("chunkText hard-splits a single giant sentence", () => {
  const chunks = chunkText("a".repeat(7000), 3000);
  assert.deepEqual(chunks.map((c) => c.length), [3000, 3000, 1000]);
});

test("selectRelevantChunks picks the chunk that mentions the question terms", () => {
  const chunks = ["rent is due monthly", "the security deposit is refundable after 30 days", "pets are not allowed"];
  assert.deepEqual(selectRelevantChunks(chunks, "Is the deposit refundable?", 1), [chunks[1]]);
});

test("token estimate is larger for non-Latin text of the same length", () => {
  assert.ok(estimateTokens("محترم صارف".repeat(10)) > estimateTokens("abcdefghij".repeat(10)));
});
