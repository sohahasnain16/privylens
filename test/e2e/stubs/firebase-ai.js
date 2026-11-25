// Test double for firebase/ai: records every call so the e2e test can assert on routing + masking.
export const InferenceMode = {
  PREFER_ON_DEVICE: "prefer_on_device", ONLY_ON_DEVICE: "only_on_device",
  PREFER_IN_CLOUD: "prefer_in_cloud", ONLY_IN_CLOUD: "only_in_cloud",
};
export class GoogleAIBackend {}
export const getAI = (app, opts) => ({ app, opts });
const mk = (type, extra = {}) => ({ type, ...extra });
export const Schema = {
  object: (o) => mk("object", o), array: (o) => mk("array", o), string: (o) => mk("string", o),
  number: (o) => mk("number", o), enumString: (o) => mk("enum", o),
};

window.__calls = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function respond(prompt, mode) {
  if (prompt.includes("Fill in the JSON fields")) {
    const doc = prompt.split('"""')[1] || "";
    return JSON.stringify({
      docType: /RENTAL/.test(doc) ? "Rental agreement" : "Test document",
      tldr: "A short plain-language summary. Contact [PHONE_1] if unsure.",
      keyPoints: ["Rent is PKR 65,000 per month", "Deposit is 6 months of rent"],
      redFlags: [{ issue: "Landlord can enter without notice", why: "No privacy for the tenant.", severity: "high" }, { issue: "Rent can rise 25%", why: "Large increases at short notice.", severity: "medium" }],
      actionItems: ["Negotiate the deposit down", "Ask for a notice period"],
      questionsToAsk: ["Can the entry clause require 24h notice?"],
    });
  }
  if (prompt.includes("Extract the important facts")) return "- Parties and amounts noted\n- Auto-renewal clause present";
  if (prompt.includes("Condense these notes")) return "- Condensed fact";
  return "Based on the excerpts: yes, with 90 days. Call [PHONE_1].";
}

export const getGenerativeModel = (ai, params) => ({
  params,
  async initializeDeviceModel(cb) { for (const f of [0.2, 0.6, 1]) { cb?.(f); await sleep(10); } window.__nanoDownloaded = true; },
  async generateContent(req) {
    const parts = Array.isArray(req) ? req : [req];
    const prompt = parts.filter((p) => typeof p === "string").join("\n");
    const images = parts.filter((p) => typeof p !== "string").length;
    window.__calls.push({ fn: "generateContent", mode: params.mode, prompt, images, structured: !!params.onDeviceParams?.promptOptions, cloudModel: params.inCloudParams?.model });
    await sleep(25);
    const onDevice = params.mode === "only_on_device" || (params.mode === "prefer_on_device" && window.__nanoOk !== false);
    return { response: { text: () => respond(prompt, params.mode), inferenceSource: onDevice ? "on_device" : "in_cloud" } };
  },
  async generateContentStream(req) {
    const prompt = typeof req === "string" ? req : req.join("\n");
    window.__calls.push({ fn: "generateContentStream", mode: params.mode, prompt, structured: false, images: 0 });
    const full = respond(prompt, params.mode);
    const onDevice = params.mode === "only_on_device" || (params.mode === "prefer_on_device" && window.__nanoOk !== false);
    async function* gen() { for (const w of full.split(" ")) { await sleep(5); yield { text: () => w + " " }; } }
    return { stream: gen(), response: Promise.resolve({ inferenceSource: onDevice ? "on_device" : "in_cloud" }) };
  },
});
