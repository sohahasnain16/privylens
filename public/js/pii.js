/**
 * PrivyLens — local PII + sensitivity detection.
 *
 * Pure, dependency-free, runs 100% in the browser. Nothing here ever touches the
 * network. It is the first stage of the "Privacy Router": before any text is
 * handed to Firebase AI Logic we find private identifiers (CNIC, cards, IBAN,
 * phones, e-mails…) and sensitive topics (medical / financial / legal), so the
 * router can keep the document on-device or mask the identifiers before a cloud
 * fallback.
 *
 * Limits (be honest): this is pattern based. Free-text names and street
 * addresses are NOT detected. Topic detection is a keyword heuristic.
 */

export const PII_LABELS = {
  CNIC: "CNIC / national ID",
  CARD: "Payment card",
  IBAN: "Bank account (IBAN)",
  SSN: "SSN",
  EMAIL: "E-mail",
  PHONE: "Phone number",
};

// Lower number = wins when two matches overlap.
const PRIORITY = { IBAN: 1, CARD: 2, CNIC: 3, SSN: 3, EMAIL: 4, PHONE: 5 };

/** Luhn checksum — keeps random long numbers from being flagged as cards. */
export function luhnValid(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** ISO 13616 mod-97 check for IBANs. */
export function ibanValid(raw) {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (iban.length < 15 || iban.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

const RULES = [
  {
    type: "IBAN",
    re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g,
    ok: (m) => ibanValid(m),
  },
  {
    type: "CARD",
    re: /\b\d(?:[ -]?\d){12,18}\b/g,
    ok: (m) => {
      if (/^\d{5}-\d{7}-\d$/.test(m)) return false; // that's a CNIC, not a card
      const d = m.replace(/[ -]/g, "");
      return d.length >= 13 && d.length <= 19 && luhnValid(d);
    },
  },
  { type: "CNIC", re: /\b\d{5}-\d{7}-\d\b/g },
  { type: "CNIC", re: /(?<![\d-])\d{13}(?![\d-])/g },
  { type: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "EMAIL", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  // Pakistani mobile numbers: 0300-1234567, +92 300 1234567, 0092-300-1234567
  { type: "PHONE", re: /(?<![\d+])(?:\+92|0092|92|0)[ -]?3\d{2}[ -]?\d{7}(?!\d)/g },
  // Generic international numbers that start with +
  { type: "PHONE", re: /(?<![\w+])\+\d{1,3}[ -]?\(?\d{2,4}\)?[ -]?\d{3,4}[ -]?\d{3,4}(?!\d)/g },
];

/**
 * @param {string} text
 * @returns {{findings: {type:string,value:string,start:number,end:number}[], counts: Record<string,number>, total:number}}
 */
export function detectPII(text) {
  const candidates = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      if (rule.ok && !rule.ok(m[0])) continue;
      candidates.push({
        type: rule.type,
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  // Greedy, non-overlapping: best priority first, then longest.
  candidates.sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type] || b.end - b.start - (a.end - a.start));
  const accepted = [];
  for (const c of candidates) {
    if (!accepted.some((a) => c.start < a.end && c.end > a.start)) accepted.push(c);
  }
  accepted.sort((a, b) => a.start - b.start);
  const counts = {};
  for (const f of accepted) counts[f.type] = (counts[f.type] || 0) + 1;
  return { findings: accepted, counts, total: accepted.length };
}

function makeRedactor() {
  const map = {};
  const byValue = new Map();
  const perType = {};
  return {
    map,
    apply(text, detected = detectPII(text)) {
      let out = "";
      let cursor = 0;
      for (const f of detected.findings) {
        const key = `${f.type}|${f.value}`;
        let token = byValue.get(key);
        if (!token) {
          perType[f.type] = (perType[f.type] || 0) + 1;
          token = `[${f.type}_${perType[f.type]}]`;
          byValue.set(key, token);
          map[token] = f.value;
        }
        out += text.slice(cursor, f.start) + token;
        cursor = f.end;
      }
      return out + text.slice(cursor);
    },
  };
}

/**
 * Replace every finding with a stable placeholder such as [CNIC_1].
 * The same value always gets the same placeholder. `map` lets us put the
 * originals back into the model's answer — locally.
 * @returns {{text:string, map:Record<string,string>, findings:object[]}}
 */
export function redact(text, detected = detectPII(text)) {
  const r = makeRedactor();
  const out = r.apply(text, detected);
  return { text: out, map: r.map, findings: detected.findings };
}

/** Redact several strings with one shared placeholder numbering (document + question). */
export function redactMany(texts) {
  const r = makeRedactor();
  const out = texts.map((t) => r.apply(t));
  return { texts: out, map: r.map };
}

/** Put original values back. Tolerates models that drop the square brackets. */
export function restore(text, map) {
  if (!map || !Object.keys(map).length || typeof text !== "string") return text;
  return text.replace(/\[?\b([A-Z]+_\d+)\b\]?/g, (whole, id) => map[`[${id}]`] ?? whole);
}

/** Apply `restore` to every string inside an object/array. */
export function restoreDeep(value, map) {
  if (typeof value === "string") return restore(value, map);
  if (Array.isArray(value)) return value.map((v) => restoreDeep(v, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restoreDeep(v, map)]));
  }
  return value;
}

const TOPICS = {
  medical: [
    "diagnosis", "patient", "prescription", "hemoglobin", "haemoglobin", "cholesterol", "blood pressure",
    "symptom", "clinical", "hospital", "medication", "dosage", "mg/dl", "pathology", "radiology", "reference range",
  ],
  financial: [
    "account number", "iban", "salary", "balance", "loan", "interest rate", "credit card", "tax return",
    "invoice", "bank statement", "installment", "instalment", "mortgage", "overdraft", "otp", "pin code",
  ],
  legal: [
    "tenant", "landlord", "lease", "agreement", "hereby", "indemnif", "arbitration", "jurisdiction",
    "liability", "witnesseth", "confidential", "terms and conditions", "terms of service",
  ],
};

/**
 * Keyword heuristic: a topic counts when at least 2 distinct keywords appear.
 * @returns {string[]} e.g. ["medical"]
 */
export function detectTopics(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [topic, words] of Object.entries(TOPICS)) {
    let hits = 0;
    for (const w of words) if (lower.includes(w)) hits++;
    if (hits >= 2) found.push(topic);
  }
  return found;
}

/**
 * Rough script detection so the router knows if Gemini Nano can read the input.
 * @returns {"latin"|"arabic"|"cjk"|"devanagari"|"other"}
 */
export function detectScript(text) {
  let latin = 0, arabic = 0, cjk = 0, deva = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c >= 0x41 && c <= 0x24f) ) latin++;
    else if ((c >= 0x600 && c <= 0x6ff) || (c >= 0x750 && c <= 0x77f) || (c >= 0xfb50 && c <= 0xfeff)) arabic++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff)) cjk++;
    else if (c >= 0x900 && c <= 0x97f) deva++;
  }
  const total = latin + arabic + cjk + deva;
  if (!total) return "latin";
  const top = Math.max(latin, arabic, cjk, deva);
  if (top === latin) return "latin";
  if (top === arabic) return "arabic";
  if (top === cjk) return "cjk";
  return "devanagari";
}
