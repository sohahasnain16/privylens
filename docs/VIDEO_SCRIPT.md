# 3-minute demo video — shot list & narration (English)

Record desktop Chrome (1080p), Gemini Nano already downloaded, app deployed or on localhost. Keep the *Settings → diagnostics* panel one click away. Target ≈ 2:45.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Title card → app home | "Rental agreements, lab reports, bank messages — the documents we most need explained are the ones we shouldn't paste into a cloud chatbot. This is PrivyLens." |
| 0:15–0:50 | Load **Rental agreement** sample. Point at the PII pills and the route card: `only_on_device`, "no network path". | "Before anything runs, PrivyLens' Privacy Router shows where this document may be read. It found a CNIC, phones and an e-mail, so it pins the request to Firebase AI Logic's ONLY_ON_DEVICE mode." |
| 0:50–1:20 | **Turn off Wi-Fi (airplane mode)**, press *Explain privately*. Result appears; hover badge "Ran entirely on this device · Gemini Nano". Scroll red flags. | "Wi-Fi is off. Gemini Nano reads it locally and flags the unfair clauses: entry without notice, 25% rent increase, forfeited deposit." |
| 1:20–1:35 | Ask follow-up "Can the landlord keep my deposit?" — streamed answer. | "Follow-ups stream from the same on-device model." |
| 1:35–2:10 | Wi-Fi back on. Load **Urdu bill notice**. Route turns amber "masked → cloud". Open *Preview exactly what could leave this device*. Explain → result; IDs are real again. | "Nano can't write Urdu yet, so the router uses the cloud — but first masks the ID and phone on-device. Here's exactly what leaves: tokens, not numbers. The real values are restored locally." |
| 2:10–2:30 | **Add sample photo** → on-device result. Then **Long gym contract** → progress "Reading part 1 of 3…", finds auto-renewal trap. | "Photos are read by the on-device multimodal model and never uploaded. Long contracts are read in parts, so they still fit Nano." |
| 2:30–2:50 | Settings: Remote Config policy → flip `force_mode` in console, *Refresh* (cut). Library drawer → Privacy Ledger. | "Routing policy lives in Remote Config — a kill-switch without a release. App Check protects AI Logic; Auth and Firestore keep a private library of explanations only, plus a ledger of how often your data never left the device." |
| 2:50–3:00 | Repo + hosted URL card | "PrivyLens: Firebase AI Logic, Gemini Nano first, cloud only when it must. Open source, Apache-2.0." |

Tips: upload to YouTube as **Public**; add English subtitles if narration isn't English; put the repo and hosted URLs in the description.
