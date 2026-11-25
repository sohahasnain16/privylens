import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonLoose, normalizeAnalysis, buildAnalysisPrompt, buildAskPrompt, buildNotesPrompt, makeTitle } from "../public/js/analysis.js";

test("parseJsonLoose handles fences and chatter", () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! Here you go: {"a":1} hope it helps'), { a: 1 });
  assert.throws(() => parseJsonLoose("no json here"));
});

test("normalizeAnalysis coerces junk into the UI shape", () => {
  const r = normalizeAnalysis({
    docType: "  Lease ",
    tldr: 5,
    keyPoints: ["a", "", null, "b"],
    redFlags: [{ issue: "Big fee", why: "Hidden", severity: "HIGH" }, { issue: "", why: "x" }, { issue: "odd", severity: "wat" }],
    actionItems: "not a list",
  });
  assert.equal(r.docType, "Lease");
  assert.equal(r.tldr, "5");
  assert.deepEqual(r.keyPoints, ["a", "b"]);
  assert.equal(r.redFlags.length, 2);
  assert.equal(r.redFlags[0].severity, "high");
  assert.equal(r.redFlags[1].severity, "medium");
  assert.deepEqual(r.actionItems, []);
  assert.deepEqual(r.questionsToAsk, []);
});

test("normalizeAnalysis survives null", () => {
  assert.equal(normalizeAnalysis(null).docType, "Document");
});

test("prompts contain the language, the text and the placeholder rule", () => {
  const p = buildAnalysisPrompt({ text: "Hello [CNIC_1]", language: "ur-Latn" });
  assert.match(p, /Roman Urdu/);
  assert.match(p, /Hello \[CNIC_1\]/);
  assert.match(p, /Copy them exactly/);
  assert.match(buildAnalysisPrompt({ text: "", language: "en", hasImage: true }), /attached image/);
  assert.match(buildNotesPrompt({ chunk: "abc", index: 2, total: 5 }), /part 2 of 5/);
  assert.match(buildAskPrompt({ question: "Why?", excerpts: ["e1", "e2"], summary: "s", language: "en" }), /QUESTION: Why\?/);
});

test("makeTitle is short", () => {
  const t = makeTitle({ docType: "Lease", tldr: "A rental contract. It has fees." });
  assert.equal(t, "Lease — A rental contract.");
});
