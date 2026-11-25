# Submission text (paste into the contest form)

**Project name:** PrivyLens — explain anything private, privately
**Platform:** Web (Chrome) — Gemini Nano via Firebase AI Logic

## Short description (one line)
PrivyLens explains contracts, lab reports, bank messages and photos of bills in plain language — on-device with Gemini Nano first, the cloud only when it must, with private IDs masked before anything leaves the device.

## Text description

**The problem.** The documents people most need explained — rental agreements, medical results, "urgent" bank messages — are exactly the ones they shouldn't paste into a cloud chatbot. They contain CNIC/ID numbers, phone numbers, health data and account details.

**The solution.** PrivyLens makes the private path the default path. It uses **Firebase AI Logic's hybrid inference** so Gemini Nano (Chrome's built-in model) reads the document on the user's device. A local **Privacy Router** decides, per request, which of the four AI Logic inference modes is allowed and shows its reasoning live:

* Sensitive text, photos, Strict mode or offline → `ONLY_ON_DEVICE` (no network path exists).
* Nothing sensitive → `PREFER_ON_DEVICE` (free, instant, cloud only as fallback).
* Something Nano can't do (Urdu/Roman Urdu output, huge documents) → `ONLY_IN_CLOUD` / `PREFER_IN_CLOUD` — **after masking CNICs, cards, IBANs, phones and e-mails with tokens on-device**; the real values are restored locally in the answer. Users can preview exactly what would leave the device.

**How Firebase AI Logic is used.** `getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })` is created per request with the mode chosen by the router; one JSON `Schema` feeds both the on-device `responseConstraint` and the cloud `responseSchema`; text **and image** input is read on-device; `generateContentStream` streams follow-up answers; `initializeDeviceModel` drives the Gemini Nano download UX; `response.inferenceSource` powers an honest "ran on this device / in the cloud" badge. Long documents are split and read on-device with map-reduce to fit Nano's small context window.

**Other Firebase products.** *App Check* (reCAPTCHA + debug token, initialised first) protects AI Logic and Firestore. *Remote Config* holds the routing policy — supported on-device languages, size limits, cloud model, PII-masking switch and a `force_mode` kill-switch — so behaviour can change without a release. *Authentication* starts anonymous and upgrades to Google via account linking. *Firestore* stores a private library of **explanations only** (never raw text/photos; enforced by security rules) plus a "Privacy Ledger" of atomic counters showing how often documents stayed on-device; offline persistence is enabled.

**Features.** Plain-language summary · red flags with severity · key points · action items · questions to ask · follow-up Q&A · 7 output languages including Urdu and Roman Urdu · photo input · works offline (service worker + on-device model) · PWA · dark mode.

**Value proposition.** Everyone gets a second pair of eyes on documents that affect their money, health and home — without handing those documents to anyone. On-device inference means zero API cost for most requests, instant answers and real privacy; the cloud adds reach (languages, long documents) with masking.

**Built during the submission period:** entire project (new app).

## Checklist (contest requirements)

- [x] Gen AI app using **Firebase AI Logic** (`public/js/ai.js`, imported and called at runtime)
- [x] **App Check** (`public/js/firebase.js`), **Remote Config** (`policy.js`), **Firestore** (`store.js`), **Authentication** (`auth.js`)
- [x] Platform: **Web (Chrome)** — Gemini Nano via Firebase AI Logic hybrid mode
- [ ] Public GitHub/GitLab repo with this code → paste URL
- [x] Open-source license file (Apache-2.0) at repo root — confirm GitHub shows it in the About box
- [ ] Hosted URL (`firebase deploy --only hosting`) → paste URL (strongly encouraged)
- [ ] ≤ 3-minute demo video on YouTube, public, English → see `docs/VIDEO_SCRIPT.md`
- [ ] App Check **debug token** registered and given to judges (contest accepts debug tokens)
- [x] Free of charge
