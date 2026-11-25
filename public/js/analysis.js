/**
 * PrivyLens — prompts + result normalisation (pure, testable in Node).
 *
 * Gemini Nano is small, so prompts are short, explicit and ask for strict JSON
 * (enforced with a schema in ai.js). Everything the model returns is treated as
 * untrusted text: it is normalised here and rendered with textContent only.
 */

import { languageInfo } from "./router.js";

export const SEVERITIES = ["low", "medium", "high"];

const RULES = (lang) => `You are PrivyLens, a careful assistant that explains confusing documents to ordinary people.
Rules:
- Write every text value in ${lang}.
- Use simple words and short sentences. Explain any legal, medical or financial jargon.
- Use ONLY facts that appear in the material. If something is unclear, say it is unclear. Never invent numbers, names or dates.
- Tokens like [CNIC_1] or [PHONE_2] stand for private details that were hidden. Copy them exactly as written.
- This is an explanation, not professional advice: never diagnose and never give a legal verdict.`;

/** Main prompt: produce the structured explanation. */
export function buildAnalysisPrompt({ text, language, hasImage = false, kind = "document" }) {
  const lang = languageInfo(language).promptName;
  const source =
    kind === "notes"
      ? `NOTES (condensed from a long document):\n"""\n${text}\n"""`
      : text
        ? `DOCUMENT${hasImage ? " (text and attached image)" : ""}:\n"""\n${text}\n"""`
        : "DOCUMENT: see the attached image.";
  return `${RULES(lang)}

Fill in the JSON fields:
- docType: a short label such as "Rental agreement", "Lab report" or "Bank message".
- tldr: at most 2 sentences — what is this and what does it want from the reader?
- keyPoints: 3 to 6 short bullet strings with the most important facts (amounts, dates, duties).
- redFlags: things that could hurt the reader (unfair clauses, hidden fees, abnormal values, scam signs). Each has issue, why, severity (low, medium or high). Use an empty list if there are none.
- actionItems: concrete next steps for the reader.
- questionsToAsk: questions to ask the other party or a professional before agreeing or acting.

${source}`;
}

/** Map step for long documents (Gemini Nano context is small). */
export function buildNotesPrompt({ chunk, index, total }) {
  return `Extract the important facts from part ${index} of ${total} of a document as short bullet points.
Include: who is involved, dates, amounts, duties, penalties, deadlines and any unusual or risky terms.
Copy tokens like [CNIC_1] exactly. Write the bullets in English. Do not add anything that is not in the text.

PART ${index}/${total}:
"""
${chunk}
"""`;
}

/** Follow-up question answered from the most relevant excerpts. */
export function buildAskPrompt({ question, excerpts, summary, language }) {
  const lang = languageInfo(language).promptName;
  return `${RULES(lang)}

Answer the QUESTION using only the EXCERPTS and SUMMARY below. If the answer is not there, say you cannot find it in the document.
Answer in at most 5 sentences, in ${lang}.

SUMMARY: ${summary || "(none)"}

EXCERPTS:
"""
${excerpts.join("\n\n---\n\n")}
"""

QUESTION: ${question}`;
}

/**
 * Parse model output that should be JSON but may be wrapped in code fences or
 * have chatter around it.
 */
export function parseJsonLoose(raw) {
  if (typeof raw !== "string") throw new Error("Empty model response");
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("The model did not return valid JSON");
  }
}

const str = (v, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).slice(0, max));
const strList = (v, max = 8) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, max) : []);

/** Coerce whatever the model gave us into the shape the UI expects. */
export function normalizeAnalysis(obj) {
  const o = obj && typeof obj === "object" ? obj : {};
  const flags = Array.isArray(o.redFlags) ? o.redFlags : [];
  return {
    docType: str(o.docType, 80) || "Document",
    tldr: str(o.tldr, 500),
    keyPoints: strList(o.keyPoints),
    redFlags: flags
      .map((f) => ({
        issue: str(f?.issue, 200),
        why: str(f?.why, 400),
        severity: SEVERITIES.includes(String(f?.severity).toLowerCase()) ? String(f.severity).toLowerCase() : "medium",
      }))
      .filter((f) => f.issue)
      .slice(0, 8),
    actionItems: strList(o.actionItems),
    questionsToAsk: strList(o.questionsToAsk),
  };
}

/** Short title for the library, derived locally. */
export function makeTitle(analysis) {
  const first = (analysis.tldr || "").split(/(?<=[.!?۔])\s/)[0] || "";
  const t = `${analysis.docType}${first ? " — " + first : ""}`;
  return t.length > 110 ? t.slice(0, 107) + "…" : t;
}
