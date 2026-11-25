/**
 * PrivyLens — Firebase AI Logic (hybrid on-device + cloud) calls.
 *
 * This is where the app actually calls Firebase AI Logic at runtime:
 *   getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })
 *   model.generateContent / generateContentStream / initializeDeviceModel
 *   response.inferenceSource  → "on_device" | "in_cloud"
 *
 * The Privacy Router (router.js) picks `mode` per request; Remote Config
 * (policy.js) supplies the cloud model + on-device options.
 */
import { getGenerativeModel, InferenceMode, Schema } from "firebase/ai";
import { ai } from "./firebase.js";
import { MODE, chunkText, selectRelevantChunks } from "./router.js";
import { redact, redactMany, restore, restoreDeep, detectPII } from "./pii.js";
import {
  buildAnalysisPrompt, buildNotesPrompt, buildAskPrompt, parseJsonLoose, normalizeAnalysis,
} from "./analysis.js";

const MODE_MAP = {
  [MODE.PREFER_ON_DEVICE]: InferenceMode.PREFER_ON_DEVICE,
  [MODE.ONLY_ON_DEVICE]: InferenceMode.ONLY_ON_DEVICE,
  [MODE.PREFER_IN_CLOUD]: InferenceMode.PREFER_IN_CLOUD,
  [MODE.ONLY_IN_CLOUD]: InferenceMode.ONLY_IN_CLOUD,
};

/** One schema, used for both paths: cloud `responseSchema` and on-device `responseConstraint`. */
export const ANALYSIS_SCHEMA = Schema.object({
  properties: {
    docType: Schema.string(),
    tldr: Schema.string(),
    keyPoints: Schema.array({ items: Schema.string() }),
    redFlags: Schema.array({
      items: Schema.object({
        properties: {
          issue: Schema.string(),
          why: Schema.string(),
          severity: Schema.string({ description: "one of: low, medium, high" }),
        },
      }),
    }),
    actionItems: Schema.array({ items: Schema.string() }),
    questionsToAsk: Schema.array({ items: Schema.string() }),
  },
});

function createOptions(policy, language, withImage) {
  const out = policy.onDeviceLanguages.includes(language) ? language : "en";
  const opts = {
    expectedInputs: [{ type: "text", languages: policy.onDeviceLanguages }, ...(withImage ? [{ type: "image" }] : [])],
    expectedOutputs: [{ type: "text", languages: [out] }],
  };
  // Chrome wants temperature and topK together; 0 means "leave the browser defaults".
  if (policy.topK > 0 && policy.temperature > 0) {
    opts.temperature = policy.temperature;
    opts.topK = policy.topK;
  }
  return opts;
}

/**
 * Build a hybrid model for one request.
 * @param {{mode:string, policy:object, language:string, withImage?:boolean, structured?:boolean}} o
 */
export function buildModel({ mode, policy, language, withImage = false, structured = false }) {
  return getGenerativeModel(ai, {
    mode: MODE_MAP[mode],
    inCloudParams: {
      model: policy.cloudModel,
      generationConfig: {
        temperature: 0.3,
        ...(structured ? { responseMimeType: "application/json", responseSchema: ANALYSIS_SCHEMA } : {}),
      },
    },
    onDeviceParams: {
      createOptions: createOptions(policy, language, withImage),
      ...(structured ? { promptOptions: { responseConstraint: ANALYSIS_SCHEMA } } : {}),
    },
  });
}

/** Which engine produced this response? Falls back to the requested mode if the SDK says nothing. */
export function sourceOf(response, mode) {
  const s = String(response?.inferenceSource ?? "").toLowerCase();
  if (s.includes("device")) return "on_device";
  if (s.includes("cloud")) return "in_cloud";
  if (mode === MODE.ONLY_ON_DEVICE) return "on_device";
  if (mode === MODE.ONLY_IN_CLOUD) return "in_cloud";
  return "unknown";
}

/** Chrome Prompt API availability for the languages we need. */
export async function getNanoStatus(policy) {
  const LM = globalThis.LanguageModel;
  if (!LM?.availability) return "unavailable";
  try {
    const s = await LM.availability({
      expectedInputs: [{ type: "text", languages: policy.onDeviceLanguages }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    return { readily: "available", "after-download": "downloadable", no: "unavailable" }[s] ?? s;
  } catch {
    return "unavailable";
  }
}

/** Download Gemini Nano. Must be called from a user gesture (click). */
export async function downloadNano(policy, onProgress) {
  const model = buildModel({ mode: MODE.PREFER_ON_DEVICE, policy, language: "en" });
  await model.initializeDeviceModel((fraction) => onProgress?.(fraction));
}

const toParts = (prompt, images) => [
  prompt,
  ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
];

/**
 * Explain a document.
 * @param {object} o
 * @param {string} o.text
 * @param {{mimeType:string, base64:string}[]} o.images
 * @param {string} o.language           output language code
 * @param {object} o.decision           from router.decide()
 * @param {object} o.policy             Remote Config policy
 * @param {(msg:string, fraction?:number)=>void} [o.onStage]
 */
export async function analyze({ text, images = [], language, decision, policy, onStage = () => {} }) {
  const sources = new Set();
  const hasImage = images.length > 0;

  // 1. Mask private identifiers if anything might leave the device.
  const detected = detectPII(text);
  const payload = decision.redact ? redact(text, detected) : { text, map: {}, findings: [] };
  const redactedCount = decision.redact ? detected.total : 0;
  if (redactedCount) onStage(`Masked ${redactedCount} private item${redactedCount > 1 ? "s" : ""} on your device`);

  let docText = payload.text;
  let kind = "document";

  // 2. Long document + Gemini Nano's small window → on-device map-reduce.
  if (decision.chunked) {
    const chunks = chunkText(docText, policy.chunkChars);
    const notes = [];
    const notesModel = buildModel({ mode: decision.mode, policy, language: "en" });
    for (let i = 0; i < chunks.length; i++) {
      onStage(`Reading part ${i + 1} of ${chunks.length}…`, i / (chunks.length + 1));
      const res = await notesModel.generateContent(buildNotesPrompt({ chunk: chunks[i], index: i + 1, total: chunks.length }));
      sources.add(sourceOf(res.response, decision.mode));
      notes.push(res.response.text().trim());
    }
    docText = notes.join("\n");
    // Keep the combined notes inside one prompt: merge neighbouring notes in pairs until they fit.
    while (docText.length > policy.maxOnDeviceChars * 0.8 && notes.length > 1) {
      const merged = [];
      for (let i = 0; i < notes.length; i += 2) {
        const group = notes.slice(i, i + 2).join("\n");
        const res = await notesModel.generateContent(`Condense these notes to the most important facts, as short bullets. Keep tokens like [CNIC_1] unchanged.\n\n${group}`);
        sources.add(sourceOf(res.response, decision.mode));
        merged.push(res.response.text().trim());
      }
      notes.splice(0, notes.length, ...merged);
      docText = notes.join("\n");
    }
    kind = "notes";
  }

  // 3. The structured explanation.
  onStage(decision.mode === MODE.ONLY_IN_CLOUD ? "Asking Gemini in the cloud…" : "Thinking on your device…", decision.chunked ? 0.9 : undefined);
  const model = buildModel({ mode: decision.mode, policy, language, withImage: hasImage, structured: true });
  const prompt = buildAnalysisPrompt({ text: docText, language, hasImage, kind });
  const res = await model.generateContent(toParts(prompt, images));
  sources.add(sourceOf(res.response, decision.mode));

  const analysis = restoreDeep(normalizeAnalysis(parseJsonLoose(res.response.text())), payload.map);
  return { analysis, sources: [...sources], redactedCount, chunked: decision.chunked };
}

/**
 * Follow-up question. On-device models are single-turn only, so each question
 * is a fresh request: tiny keyword retrieval picks the relevant excerpts and
 * the answer is streamed token by token.
 */
export async function ask({ question, text, analysis, language, decision, policy, onText }) {
  const useMask = decision.redact;
  const masked = useMask ? redactMany([text, question]) : { texts: [text, question], map: {} };
  const [docText, q] = masked.texts;
  const chunks = chunkText(docText, Math.min(policy.chunkChars, 3000));
  const excerpts = selectRelevantChunks(chunks, q, 2);
  const summary = analysis ? `${analysis.docType}. ${analysis.tldr}` : "";

  const model = buildModel({ mode: decision.mode, policy, language });
  const prompt = buildAskPrompt({ question: q, excerpts, summary, language });
  const { stream, response } = await model.generateContentStream(prompt);
  let acc = "";
  for await (const chunk of stream) {
    acc += chunk.text();
    onText?.(restore(acc, masked.map));
  }
  const final = await response;
  return { text: restore(acc, masked.map), source: sourceOf(final, decision.mode) };
}
