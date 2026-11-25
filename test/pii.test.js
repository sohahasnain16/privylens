import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPII, redact, restore, restoreDeep, detectTopics, detectScript, luhnValid, ibanValid } from "../public/js/pii.js";

test("detects a dashed CNIC, a PK mobile number and an e-mail", () => {
  const t = "CNIC 42101-1234567-1, call 0300-1234567 or +92 321 5551234, mail ali.khan@example.com";
  const d = detectPII(t);
  assert.deepEqual(d.counts, { CNIC: 1, PHONE: 2, EMAIL: 1 });
  assert.equal(d.total, 4);
});

test("a Luhn-valid card is a CARD, a random 16-digit number is not", () => {
  assert.ok(luhnValid("4111111111111111"));
  assert.equal(detectPII("pay with 4111 1111 1111 1111 today").counts.CARD, 1);
  assert.equal(detectPII("order 1234 5678 9012 3456 shipped").counts.CARD, undefined);
});

test("a dashed CNIC that happens to pass Luhn is still labelled CNIC", () => {
  // 42101-1234567-1 → check both outcomes are never CARD
  const d = detectPII("42101-1234567-1");
  assert.equal(d.counts.CARD, undefined);
  assert.equal(d.counts.CNIC, 1);
});

test("IBAN is validated with mod-97", () => {
  assert.ok(ibanValid("GB82 WEST 1234 5698 7654 32"));
  assert.ok(!ibanValid("GB82 WEST 1234 5698 7654 33"));
  assert.equal(detectPII("send to GB82 WEST 1234 5698 7654 32 please").counts.IBAN, 1);
  assert.equal(detectPII("send to GB82 WEST 1234 5698 7654 33 please").counts.IBAN, undefined);
});

test("redact → restore round-trips and reuses tokens for repeated values", () => {
  const t = "Ali (42101-1234567-1) and again 42101-1234567-1; phone 03001234567.";
  const r = redact(t);
  assert.match(r.text, /\[CNIC_1\].*\[CNIC_1\]/);
  assert.ok(!r.text.includes("42101"));
  assert.ok(!r.text.includes("03001234567"));
  assert.equal(restore(r.text, r.map), t);
});

test("restore tolerates a model that drops the brackets", () => {
  const map = { "[PHONE_1]": "0300-1234567" };
  assert.equal(restore("Call PHONE_1 now", map), "Call 0300-1234567 now");
  assert.equal(restore("Call [PHONE_1] now", map), "Call 0300-1234567 now");
  assert.equal(restore("Unknown [FOO_9] stays", map), "Unknown [FOO_9] stays");
});

test("restoreDeep walks nested structures", () => {
  const map = { "[EMAIL_1]": "a@b.co" };
  const out = restoreDeep({ a: ["x [EMAIL_1]"], b: { c: "[EMAIL_1]" }, n: 3 }, map);
  assert.deepEqual(out, { a: ["x a@b.co"], b: { c: "a@b.co" }, n: 3 });
});

test("topic detection needs two keywords", () => {
  assert.deepEqual(detectTopics("The patient has low hemoglobin."), ["medical"]);
  assert.deepEqual(detectTopics("Nice weather today"), []);
  assert.ok(detectTopics("Tenant pays the landlord rent under this lease agreement").includes("legal"));
});

test("script detection", () => {
  assert.equal(detectScript("Hello world"), "latin");
  assert.equal(detectScript("محترم صارف آپ کا بل"), "arabic");
  assert.equal(detectScript("これは日本語です"), "cjk");
});
