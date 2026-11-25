/**
 * PrivyLens — UI wiring.
 * All model output is rendered with textContent (never innerHTML).
 */
import { LANGUAGES, PRIVACY, MODE, decide, cloudFallback, estimateTokens, languageInfo } from "./router.js";
import { detectPII, detectTopics, redact, PII_LABELS } from "./pii.js";
import { makeTitle } from "./analysis.js";
import { analyze, ask, getNanoStatus, downloadNano } from "./ai.js";
import { refreshPolicy, readPolicy, policySource } from "./policy.js";
import { watchUser, signInWithGoogle, logOut } from "./auth.js";
import { saveAnalysis, watchLibrary, deleteAnalysis, recordRun, watchLedger } from "./store.js";
import { prepareImage, makeSamplePhoto } from "./image.js";
import { SAMPLES } from "./samples.js";
import { configured, appCheck } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

/* ───────────────────────── tiny DOM helpers ───────────────────────── */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}
let toastTimer;
function toast(msg, ms = 3200) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

/* ───────────────────────── state ───────────────────────── */
const state = {
  policy: readPolicy(),
  nano: "unavailable",
  online: navigator.onLine,
  simOffline: false,
  privacy: PRIVACY.BALANCED,
  language: "en",
  images: [],
  user: null,
  last: null, // { analysis, sources, redactedCount, text, decision, saved }
  busy: false,
  unsubLibrary: null,
  unsubLedger: null,
};

const isOnline = () => state.online && !state.simOffline;

function currentCtx() {
  const text = $("doc").value;
  return {
    text,
    imageCount: state.images.length,
    language: state.language,
    privacy: state.privacy,
    nano: state.nano,
    online: isOnline(),
    pii: detectPII(text),
    topics: detectTopics(text),
    policy: state.policy,
  };
}

/* ───────────────────────── header chips ───────────────────────── */
function renderChips() {
  const nano = $("chipNano");
  const map = {
    available: ["ok", "Gemini Nano ready"],
    downloadable: ["warn", "Gemini Nano: download needed"],
    downloading: ["warn", "Gemini Nano downloading…"],
    unavailable: ["bad", "Gemini Nano unavailable · cloud mode"],
  };
  const [s, label] = map[state.nano] || map.unavailable;
  nano.dataset.state = s;
  nano.textContent = label;

  const net = $("chipNet");
  net.dataset.state = isOnline() ? "ok" : "warn";
  net.textContent = state.simOffline ? "Offline (simulated)" : state.online ? "Online" : "Offline · device only";
}

async function refreshNano() {
  state.nano = await getNanoStatus(state.policy);
  renderChips();
  renderRoute();
  if (state.nano === "downloading") setTimeout(refreshNano, 4000);
}

/* ───────────────────────── language + privacy controls ───────────────────────── */
function renderLanguages() {
  const sel = $("lang");
  sel.replaceChildren(
    ...LANGUAGES.map((l) =>
      h("option", { value: l.code, text: `${l.label}  ${state.policy.onDeviceLanguages.includes(l.code) ? "⚡ on-device" : "☁ cloud"}` }),
    ),
  );
  sel.value = state.language;
}

function renderPrivacy() {
  for (const b of $("privacy").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.level === state.privacy));
}

/* ───────────────────────── live Privacy Router preview ───────────────────────── */
function renderRoute() {
  const ctx = currentCtx();
  const d = decide(ctx);
  const el = $("route");
  el.dataset.route = d.route;

  const nanoSub = { available: "Gemini Nano ready", downloadable: "Nano: needs download", downloading: "Nano downloading", unavailable: "Nano unavailable" }[state.nano];
  const deviceNode = h("div", { class: `node device${d.route === "cloud" ? " off" : ""}` }, icon("chip"), h("div", {}, "This device", h("small", { text: nanoSub })));
  const cloudNode = h("div", { class: `node cloud${d.route === "on-device" || d.route === "blocked" ? " off" : ""}` }, icon("cloud"), h("div", {}, "Gemini cloud", h("small", { text: d.redact ? "sees masked text only" : "via Firebase AI Logic" })));
  const linkText = { "on-device": "no network path", hybrid: "fallback only", cloud: d.redact ? "masked → cloud" : "cloud", blocked: "blocked" }[d.route];
  const flow = h("div", { class: "flow" }, deviceNode, h("div", { class: "link" }, h("span", { text: linkText })), cloudNode);

  const pills = [];
  for (const [type, n] of Object.entries(ctx.pii.counts)) pills.push(h("span", { class: "pill warn", text: `${PII_LABELS[type] || type} ×${n}` }));
  for (const t of ctx.topics) pills.push(h("span", { class: "pill warn", text: `${t} content` }));
  if (ctx.imageCount) pills.push(h("span", { class: "pill warn", text: `${ctx.imageCount} photo${ctx.imageCount > 1 ? "s" : ""}` }));
  if (!pills.length && (ctx.text || ctx.imageCount)) pills.push(h("span", { class: "pill ok", text: "No private identifiers found" }));
  if (d.chunked) pills.push(h("span", { class: "pill", text: "long document → read in parts on-device" }));

  const meta = d.mode
    ? h("p", { class: "muted small" }, "Inference mode: ", h("code", { text: d.mode }), `  ·  mask PII: ${d.redact ? "yes" : "no"}`)
    : null;

  const parts = [flow, h("div", { class: "pills" }, pills), h("ul", { class: "reasons" }, d.reasons.map((r) => h("li", { text: r }))), meta];

  if (d.redact && ctx.pii.total) {
    const masked = redact(ctx.text, ctx.pii).text;
    parts.push(
      h("details", {}, h("summary", { text: "Preview exactly what could leave this device" }), h("pre", { text: masked.length > 700 ? masked.slice(0, 700) + "…" : masked })),
    );
  }
  el.replaceChildren(...parts.filter(Boolean));

  const btn = $("btnAnalyze");
  btn.disabled = state.busy || d.blocked;
  $("analyzeLabel").textContent = d.blocked
    ? "Can't run with these settings"
    : { "on-device": "Explain privately (on-device)", hybrid: "Explain (on-device first)", cloud: d.redact ? "Explain with Gemini (private items masked)" : "Explain with Gemini" }[d.route];

  const chars = ctx.text.length;
  $("docMeta").textContent = `${chars.toLocaleString()} characters · ~${estimateTokens(ctx.text).toLocaleString()} tokens`;
  return d;
}

/* ───────────────────────── progress / errors ───────────────────────── */
function setProgress(msg, fraction) {
  $("progress").hidden = false;
  const bar = $("progress").querySelector(".bar");
  bar.classList.toggle("indeterminate", fraction == null);
  $("bar").style.width = fraction == null ? "" : `${Math.round(fraction * 100)}%`;
  $("progressText").textContent = msg;
}
function clearProgress() {
  $("progress").hidden = true;
}

function friendlyError(e) {
  const m = String(e?.message || e);
  if (/quota|too large|exceed|context window|input is too long/i.test(m)) {
    return "This is too much text for Gemini Nano's small window. Try a shorter excerpt, or use Balanced / Cloud-OK so long documents can be read in parts or by the cloud.";
  }
  if (/app.?check|appcheck|permission|api key|403|PERMISSION_DENIED/i.test(m)) {
    return `Firebase rejected the cloud request (check App Check, the API key restrictions and that Firebase AI Logic is enabled). Details: ${m}`;
  }
  if (/on-device|not available|unavailable|not supported|NotSupported/i.test(m)) {
    return `Gemini Nano couldn't handle this request on your device. ${m}`;
  }
  return m;
}

function showError(e, decision, ctx) {
  console.error("[PrivyLens]", e);
  const box = $("error");
  const fb = decision && decision.mode === MODE.ONLY_ON_DEVICE ? cloudFallback(decision, ctx) : null;
  box.replaceChildren(
    h("b", { text: "That didn't work" }),
    h("p", { text: friendlyError(e) }),
    fb
      ? h("div", { class: "row" },
          h("button", { class: "btn", type: "button", onclick: () => { box.hidden = true; analyzeNow(fb); } }, icon("cloud"), "Retry in the cloud (private items masked)"))
      : null,
  );
  box.hidden = false;
  $("empty").hidden = true;
}

/* ───────────────────────── Gemini Nano setup dialog ───────────────────────── */
function openSetup(why) {
  $("setupWhy").textContent = why || "Gemini Nano runs inside Chrome so your document never leaves this device.";
  const supported = typeof globalThis.LanguageModel !== "undefined";
  $("setupStatus").textContent = supported
    ? `Current status: ${state.nano}.`
    : "This browser doesn't expose Chrome's Prompt API (use desktop Chrome 139+ and enable the flag). PrivyLens still works via the cloud in Balanced / Cloud-OK.";
  $("btnDownload").disabled = !supported || state.nano === "available";
  $("dlgSetup").showModal();
}

async function onDownload() {
  const btn = $("btnDownload");
  btn.disabled = true;
  $("dlProgress").hidden = false;
  $("dlText").textContent = "Starting download…";
  try {
    await downloadNano(state.policy, (f) => {
      $("dlBar").style.width = `${Math.round(f * 100)}%`;
      $("dlText").textContent = `Downloading Gemini Nano… ${Math.round(f * 100)}%`;
    });
    await refreshNano();
    $("dlText").textContent = "Done — Gemini Nano is ready.";
    toast("Gemini Nano is ready ✓");
  } catch (e) {
    $("dlText").textContent = `Download failed: ${e?.message || e}`;
    btn.disabled = false;
  }
}

/* ───────────────────────── analyse ───────────────────────── */
function analyzeNow(forced) {
  return onAnalyze(forced);
}

async function onAnalyze(forced) {
  if (state.busy) return;
  const ctx = currentCtx();
  if (!ctx.text.trim() && !ctx.imageCount) return toast("Paste some text or add a photo first.");
  const decision = forced || decide(ctx);
  if (decision.blocked) return toast("Blocked: " + decision.reasons.at(-1));

  // Strict / pinned requests need Nano on this device before we can start.
  if (decision.mode === MODE.ONLY_ON_DEVICE && state.nano !== "available") {
    return openSetup("This document is kept on-device, so Gemini Nano must be installed first.");
  }

  state.busy = true;
  $("btnAnalyze").disabled = true;
  $("error").hidden = true;
  setProgress(decision.mode === MODE.ONLY_IN_CLOUD ? "Preparing…" : "Thinking on your device…");
  try {
    const out = await analyze({
      text: ctx.text, images: state.images, language: ctx.language, decision, policy: state.policy,
      onStage: setProgress,
    });
    state.last = { ...out, text: ctx.text, decision, ctx, saved: false };
    renderResult();
    if (state.user) recordRun(state.user.uid, out).catch((e) => console.info("[ledger]", e?.code || e));
  } catch (e) {
    showError(e, decision, ctx);
  } finally {
    state.busy = false;
    clearProgress();
    renderRoute();
  }
}

/* ───────────────────────── render result ───────────────────────── */
function badgeFor(sources, redactedCount) {
  const dev = sources.includes("on_device");
  const cld = sources.includes("in_cloud");
  if (dev && !cld) return { cls: "device", icon: "chip", text: "Ran entirely on this device · Gemini Nano" };
  if (cld && !dev) {
    return { cls: "cloud", icon: "cloud", text: `Gemini in the cloud${redactedCount ? ` · ${redactedCount} private item${redactedCount > 1 ? "s" : ""} masked first` : ""}` };
  }
  if (dev && cld) return { cls: "mixed", icon: "chip", text: "Mixed: on-device + cloud" };
  return { cls: "device", icon: "shield", text: "Firebase AI Logic" };
}

function section(title, content) {
  return h("section", { class: "r-sec" }, h("h4", { text: title }), content);
}

function renderResult() {
  const { analysis: a, sources, redactedCount, text } = state.last;
  const info = languageInfo(state.last.ctx?.language || state.language);
  const rtl = ["ur", "ar"].includes(info.code);

  const b = badgeFor(sources, redactedCount);
  const badge = $("badge");
  badge.className = `badge ${b.cls}`;
  badge.replaceChildren(icon(b.icon), b.text);

  const body = [
    h("span", { class: "r-type", text: a.docType }),
    h("p", { class: "r-tldr", text: a.tldr }),
  ];
  if (a.redFlags.length) {
    body.push(
      section("Red flags", h("div", { class: "flags" }, a.redFlags.map((f) =>
        h("div", { class: "flag", "data-sev": f.severity }, h("b", {}, icon("alert"), f.issue, h("span", { class: "sev", text: f.severity })), f.why ? h("p", { text: f.why }) : null)))),
    );
  }
  if (a.keyPoints.length) body.push(section("Key points", h("ul", {}, a.keyPoints.map((k) => h("li", { text: k })))));
  if (a.actionItems.length) body.push(section("What you can do", h("ul", {}, a.actionItems.map((k) => h("li", { text: k })))));
  if (a.questionsToAsk.length) body.push(section("Questions to ask", h("ul", {}, a.questionsToAsk.map((k) => h("li", { text: k })))));

  const rb = $("resultBody");
  rb.replaceChildren(...body);
  rb.className = rtl ? "rtl" : "";
  rb.setAttribute("lang", info.code);

  $("empty").hidden = true;
  $("error").hidden = true;
  $("result").hidden = false;

  const saveBtn = $("btnSave");
  saveBtn.disabled = !state.user || state.last.saved;
  saveBtn.replaceChildren(icon(state.last.saved ? "check" : "save"), state.last.saved ? " Saved" : " Save");

  const canAsk = Boolean(text && text.trim());
  $("askInput").disabled = !canAsk;
  $("askNote").hidden = canAsk;
  $("askNote").textContent = "Follow-up questions need the original text, which PrivyLens never stores. Paste the document again to ask more.";
  $("askOut").hidden = true;
  $("askOut").textContent = "";
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function asMarkdown(a) {
  const list = (t, xs) => (xs.length ? `\n## ${t}\n${xs.map((x) => `- ${x}`).join("\n")}\n` : "");
  return `# ${a.docType}\n\n${a.tldr}\n${a.redFlags.length ? `\n## Red flags\n${a.redFlags.map((f) => `- [${f.severity}] ${f.issue} — ${f.why}`).join("\n")}\n` : ""}${list("Key points", a.keyPoints)}${list("What you can do", a.actionItems)}${list("Questions to ask", a.questionsToAsk)}\n_Explained privately with PrivyLens — not professional advice._\n`;
}

async function onSave() {
  if (!state.user || !state.last || state.last.saved) return;
  try {
    await saveAnalysis(state.user.uid, {
      title: makeTitle(state.last.analysis),
      docType: state.last.analysis.docType,
      language: state.last.ctx?.language || state.language,
      route: state.last.decision?.route || "on-device",
      sources: state.last.sources,
      redactedCount: state.last.redactedCount,
      result: state.last.analysis,
    });
    state.last.saved = true;
    renderResult();
    toast("Saved to your library (explanation only)");
  } catch (e) {
    toast("Couldn't save: " + (e?.code || e?.message));
  }
}

/* ───────────────────────── follow-up questions ───────────────────────── */
async function onAsk(ev) {
  ev.preventDefault();
  const q = $("askInput").value.trim();
  if (!q || !state.last?.text || state.busy) return;
  const { decision, analysis, text } = state.last;
  const out = $("askOut");
  out.hidden = false;
  out.textContent = "…";
  state.busy = true;
  try {
    const res = await ask({
      question: q, text, analysis, language: state.last.ctx?.language || state.language, decision, policy: state.policy,
      onText: (t) => (out.textContent = t),
    });
    out.textContent = res.text || "(no answer)";
  } catch (e) {
    out.textContent = "Couldn't answer: " + friendlyError(e);
  } finally {
    state.busy = false;
  }
}

/* ───────────────────────── library drawer + ledger ───────────────────────── */
function renderLedger(s) {
  const cell = (cls, n, label) => h("div", { class: cls }, h("b", { text: String(n ?? 0) }), h("span", { text: label }));
  $("ledger").replaceChildren(cell("", s.runs, "explanations"), cell("dev", s.onDevice, "on-device"), cell("cld", s.cloud, "cloud"), cell("", s.masked, "items masked"));
}

function renderLibrary(items) {
  const list = $("libList");
  if (!items.length) {
    list.replaceChildren(h("li", { class: "muted", text: "Nothing saved yet. Press Save on an explanation." }));
    return;
  }
  list.replaceChildren(
    ...items.map((it) => {
      const when = it.createdAt?.toDate ? it.createdAt.toDate().toLocaleDateString() : "just now";
      const dev = (it.sources || []).includes("on_device");
      return h("li", { class: "lib-item" },
        h("button", { class: "open", type: "button", onclick: () => loadSaved(it) }, h("b", { text: it.title || it.docType }), h("small", { text: `${when} · ${dev ? "on-device" : "cloud"}` })),
        h("button", { class: "btn ghost small icon-only", type: "button", "aria-label": "Delete", onclick: () => state.user && deleteAnalysis(state.user.uid, it.id).catch(() => toast("Couldn't delete")) }, icon("trash")));
    }),
  );
}

function loadSaved(it) {
  state.last = { analysis: it.result, sources: it.sources || [], redactedCount: it.redactedCount || 0, text: "", decision: null, ctx: { language: it.language }, saved: true };
  renderResult();
  toggleDrawer(false);
}

function toggleDrawer(open) {
  const d = $("drawer");
  d.classList.toggle("open", open);
  d.setAttribute("aria-hidden", String(!open));
}

function startUserWatchers() {
  state.unsubLibrary?.();
  state.unsubLedger?.();
  state.unsubLibrary = state.unsubLedger = null;
  renderLedger({});
  renderLibrary([]);
  if (!state.user) return;
  state.unsubLibrary = watchLibrary(state.user.uid, renderLibrary, (e) => console.info("[library]", e?.code));
  state.unsubLedger = watchLedger(state.user.uid, renderLedger, (e) => console.info("[ledger]", e?.code));
}

/* ───────────────────────── auth UI ───────────────────────── */
function renderAuth() {
  const u = state.user;
  const label = !configured ? "Demo mode" : !u ? "Sign in" : u.isAnonymous ? "Sign in with Google" : u.displayName || u.email || "Account";
  $("authLabel").textContent = label;
  $("btnSave").disabled = !u || !state.last || state.last.saved;
}

async function onAuthClick() {
  if (!configured) return toast("Add your Firebase config in public/config.js to enable sign-in and the library.");
  try {
    if (!state.user || state.user.isAnonymous) {
      await signInWithGoogle();
      toast("Signed in — your library was kept");
    } else if (confirm("Sign out?")) {
      await logOut();
    }
  } catch (e) {
    toast("Sign-in failed: " + (e?.code || e?.message));
  }
}

/* ───────────────────────── settings / diagnostics ───────────────────────── */
function openSettings() {
  const rows = [
    ["Firebase project", configured ? "connected" : "not configured (device-only demo)"],
    ["App Check", appCheck ? "active" : "off"],
    ["Signed in as", state.user ? (state.user.isAnonymous ? "anonymous user" : state.user.email || "Google user") : "—"],
    ["Remote Config", policySource() === "remote" ? "fetched from server" : "built-in defaults"],
    ["Gemini Nano", state.nano],
    ["Chrome Prompt API", typeof globalThis.LanguageModel !== "undefined" ? "present" : "missing"],
  ];
  $("diag").replaceChildren(...rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })]));
  $("policyJson").textContent = JSON.stringify(state.policy, null, 2);
  $("simOffline").checked = state.simOffline;
  $("dlgSettings").showModal();
}

async function onRefreshPolicy() {
  $("btnRefreshPolicy").disabled = true;
  state.policy = await refreshPolicy();
  renderLanguages();
  await refreshNano();
  openSettings();
  $("btnRefreshPolicy").disabled = false;
  toast("Policy refreshed");
}

/* ───────────────────────── images ───────────────────────── */
function renderThumbs() {
  $("thumbs").replaceChildren(
    ...state.images.map((img, i) =>
      h("div", { class: "thumb" }, h("img", { src: img.dataUrl, alt: img.name }),
        h("button", { type: "button", "aria-label": "Remove photo", onclick: () => { state.images.splice(i, 1); renderThumbs(); renderRoute(); } }, icon("x")))),
  );
}

async function addImageFiles(files) {
  for (const f of files) {
    if (state.images.length >= 3) return toast("Up to 3 photos at a time.");
    try {
      state.images.push(await prepareImage(f));
    } catch {
      toast(`Couldn't read ${f.name || "that image"}.`);
    }
  }
  renderThumbs();
  renderRoute();
}

/* ───────────────────────── boot ───────────────────────── */
function bind() {
  $("sample").append(...SAMPLES.map((s) => h("option", { value: s.id, text: s.label })));
  $("sample").addEventListener("change", (e) => {
    const s = SAMPLES.find((x) => x.id === e.target.value);
    if (!s) return;
    $("doc").value = s.text;
    state.language = s.language;
    $("lang").value = s.language;
    state.images = [];
    renderThumbs();
    renderRoute();
    e.target.value = "";
  });

  let t;
  $("doc").addEventListener("input", () => { clearTimeout(t); t = setTimeout(renderRoute, 180); });
  $("doc").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onAnalyze(); });
  $("doc").addEventListener("dragover", (e) => e.preventDefault());
  $("doc").addEventListener("drop", async (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const txt = files.find((f) => f.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(f.name));
    if (txt) { $("doc").value = await txt.text(); renderRoute(); }
    if (imgs.length) await addImageFiles(imgs);
  });
  $("doc").addEventListener("paste", (e) => {
    const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (imgs.length) { e.preventDefault(); addImageFiles(imgs); }
  });

  $("btnPhoto").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", (e) => { addImageFiles([...e.target.files]); e.target.value = ""; });
  $("btnSamplePhoto").addEventListener("click", async () => {
    if (state.images.length >= 3) return toast("Up to 3 photos at a time.");
    state.images.push(await makeSamplePhoto());
    renderThumbs();
    renderRoute();
  });

  $("lang").addEventListener("change", (e) => { state.language = e.target.value; renderRoute(); });
  $("privacy").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-level]");
    if (!b) return;
    state.privacy = b.dataset.level;
    renderPrivacy();
    renderRoute();
  });

  $("btnAnalyze").addEventListener("click", () => onAnalyze());
  $("btnCopy").addEventListener("click", async () => {
    if (!state.last) return;
    try { await navigator.clipboard.writeText(asMarkdown(state.last.analysis)); toast("Copied"); } catch { toast("Couldn't copy"); }
  });
  $("btnSave").addEventListener("click", onSave);
  $("askForm").addEventListener("submit", onAsk);

  $("btnLibrary").addEventListener("click", () => toggleDrawer(true));
  $("btnCloseDrawer").addEventListener("click", () => toggleDrawer(false));
  $("btnAuth").addEventListener("click", onAuthClick);
  $("btnSettings").addEventListener("click", openSettings);
  $("chipNano").addEventListener("click", () => openSetup());
  $("btnDownload").addEventListener("click", onDownload);
  $("btnCopyFlag").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText("chrome://flags/#prompt-api-for-gemini-nano-multimodal-input"); toast("Copied — paste it into a new tab"); } catch { toast("Couldn't copy"); }
  });
  $("btnRefreshPolicy").addEventListener("click", onRefreshPolicy);
  $("simOffline").addEventListener("change", (e) => { state.simOffline = e.target.checked; renderChips(); renderRoute(); });

  addEventListener("online", () => { state.online = true; renderChips(); renderRoute(); });
  addEventListener("offline", () => { state.online = false; renderChips(); renderRoute(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") toggleDrawer(false); });
}

async function boot() {
  bind();
  renderLanguages();
  renderPrivacy();
  renderChips();
  renderRoute();
  renderLedger({});

  if (!configured) {
    const b = $("banner");
    b.hidden = false;
    b.textContent = "Demo mode: Firebase isn't configured yet (edit public/config.js). On-device analysis still works in Chrome; cloud fallback, sign-in, library and Remote Config need your project.";
  }

  watchUser((user, err) => {
    if (err) console.info("[auth]", err?.code || err?.message);
    state.user = user;
    renderAuth();
    startUserWatchers();
  });

  refreshNano();
  refreshPolicy().then((p) => { state.policy = p; renderLanguages(); refreshNano(); });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.info("[sw]", e?.message));
  }
}

boot();
