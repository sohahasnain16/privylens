"""
Headless-Chrome end-to-end test for PrivyLens.

The real app (public/) is served locally; the Firebase SDK URLs on gstatic are intercepted and
answered with test doubles from ./stubs, so we can assert on *what the app asks the SDK to do*:
which inference mode, whether PII was masked, how many chunks, what lands in Firestore.

  python3 test/e2e/run_e2e.py [--shots DIR]
"""
import http.server, socketserver, threading, os, sys, json, re, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
STUBS = Path(__file__).resolve().parent / "stubs"
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

FAKE_CONFIG = """
export const firebaseConfig = { apiKey: "test-key", authDomain: "t.firebaseapp.com", projectId: "t-proj", storageBucket: "t", messagingSenderId: "1", appId: "1:1:web:1" };
export const appCheckConfig = { provider: "recaptcha-v3", siteKey: "site-key-123", debugToken: "11111111-2222-3333-4444-555555555555" };
export const runtimeConfig = { rcMinFetchMs: 0 };
"""

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    handler = functools.partial(Quiet, directory=str(PUBLIC))
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("  PASS " if cond else "  FAIL ") + name + (f"  -> {detail}" if (detail and not cond) else ""))

def route_stubs(ctx, configured):
    def fulfil(route):
        url = route.request.url
        name = url.rsplit("/", 1)[-1]
        f = STUBS / name
        if f.exists(): route.fulfill(status=200, content_type="text/javascript", body=f.read_text())
        else: route.fulfill(status=404, body="no stub " + name)
    ctx.route(re.compile(r"https://www\.gstatic\.com/firebasejs/.*"), fulfil)
    if configured:
        ctx.route(re.compile(r".*/config\.js$"), lambda r: r.fulfill(status=200, content_type="text/javascript", body=FAKE_CONFIG))

def shot(page, name):
    if SHOTS: page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)

def pick_sample(page, sid):
    page.select_option("#sample", sid)
    page.wait_for_timeout(300)

def run():
    srv, port = serve()
    base = f"http://127.0.0.1:{port}/index.html"
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"], headless=True)

        # ───────────── A. device-only demo mode (placeholder config) ─────────────
        print("A. demo mode, Nano available")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        route_stubs(ctx, configured=False)
        ctx.add_init_script("window.LanguageModel = { availability: async () => 'available' };")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(base); page.wait_for_selector("#route .flow")
        check("page boots without JS errors", not errors, errors)
        check("demo banner shown when Firebase isn't configured", page.is_visible("#banner"))
        check("Nano chip shows ready", "ready" in page.inner_text("#chipNano").lower(), page.inner_text("#chipNano"))
        shot(page, "01-empty")

        pick_sample(page, "rent")
        check("rent sample: router pins ONLY_ON_DEVICE", "only_on_device" in page.inner_text("#route"), page.inner_text("#route")[:200])
        check("rent sample: shows CNIC pill", "CNIC" in page.inner_text("#route .pills"))
        check("route marked on-device", page.get_attribute("#route", "data-route") == "on-device")
        shot(page, "02-route-on-device")
        page.click("#btnAnalyze"); page.wait_for_selector("#result:not([hidden])")
        check("result rendered", "rental agreement" in page.inner_text("#resultBody").lower())
        check("badge says on-device", "entirely on this device" in page.inner_text("#badge"))
        calls = page.evaluate("window.__calls")
        main = [c for c in calls if c["structured"]][-1]
        check("structured request used only_on_device", main["mode"] == "only_on_device", main["mode"])
        check("on-device prompt keeps the original CNIC (never leaves the device)", "42101-8765432-1" in main["prompt"])
        check("model output shows severity flags", page.locator(".flag[data-sev='high']").count() == 1)
        shot(page, "03-result-on-device")

        # follow-up
        page.fill("#askInput", "Can I get my deposit back?"); page.press("#askInput", "Enter")
        page.wait_for_function("document.querySelector('#askOut').textContent.includes('90 days')")
        ask_call = [c for c in page.evaluate("window.__calls") if c["fn"] == "generateContentStream"][-1]
        check("follow-up streamed single-turn (no chat)", ask_call["fn"] == "generateContentStream")
        shot(page, "04-followup")

        # Urdu → cloud with masking, and placeholders restored locally
        pick_sample(page, "urdu")
        check("Urdu sample routes to cloud", page.get_attribute("#route", "data-route") == "cloud", page.get_attribute("#route", "data-route"))
        check("Urdu route preview shows masked text", "[CNIC_1]" in page.inner_html("#route") or "CNIC_1" in page.inner_text("#route"))
        shot(page, "05-route-cloud-masked")
        page.click("#btnAnalyze"); page.wait_for_selector("#badge.cloud")
        cloud = [c for c in page.evaluate("window.__calls") if c["structured"]][-1]
        check("cloud request used only_in_cloud", cloud["mode"] == "only_in_cloud", cloud["mode"])
        check("cloud prompt has NO raw CNIC/phone digits", "42201-1122334-5" not in cloud["prompt"] and "0321-5551234" not in cloud["prompt"], cloud["prompt"][-300:])
        check("cloud prompt carries placeholders", "[CNIC_1]" in cloud["prompt"] and "[PHONE_1]" in cloud["prompt"])
        check("placeholders restored in the visible answer", "0321-5551234" in page.inner_text("#resultBody"), page.inner_text("#resultBody")[:200])
        check("RTL applied for Urdu output", page.get_attribute("#resultBody", "class") == "rtl")
        shot(page, "06-result-cloud-urdu")

        # long doc → on-device map-reduce
        page.evaluate("window.__calls.length = 0")
        pick_sample(page, "long")
        check("long sample flagged as chunked", "read in parts" in page.inner_text("#route .pills"))
        page.click("#btnAnalyze"); page.wait_for_selector("#badge.device", timeout=15000)
        notes = [c for c in page.evaluate("window.__calls") if "Extract the important facts" in c["prompt"]]
        check("map-reduce issued several on-device note requests", len(notes) >= 2, len(notes))
        check("every chunk call pinned on-device", all(c["mode"] == "only_on_device" for c in notes))
        shot(page, "07-long-doc")

        # photo path
        page.evaluate("window.__calls.length = 0")
        page.fill("#doc", ""); page.click("#btnSamplePhoto"); page.wait_for_timeout(200)
        check("photo counted as sensitive, pinned on-device", "only_on_device" in page.inner_text("#route"))
        page.click("#btnAnalyze"); page.wait_for_selector("#badge.device", timeout=10000)
        img = [c for c in page.evaluate("window.__calls") if c["structured"]][-1]
        check("image attached to the on-device request", img["images"] == 1, img["images"])
        shot(page, "08-photo")

        # strict + Urdu → blocked
        page.fill("#doc", "Hello"); page.evaluate("document.querySelectorAll('.thumb button').forEach(b=>b.click())")
        page.click("#privacy button[data-level='strict']"); page.select_option("#lang", "ur")
        check("strict + Urdu is blocked, button disabled", page.is_disabled("#btnAnalyze") and page.get_attribute("#route", "data-route") == "blocked")
        shot(page, "09-blocked")

        # simulated offline
        page.click("#privacy button[data-level='balanced']"); page.select_option("#lang", "en")
        page.click("#btnSettings"); page.check("#simOffline"); page.keyboard.press("Escape")
        check("offline chip", "Offline" in page.inner_text("#chipNet"))
        check("offline route stays on-device", page.get_attribute("#route", "data-route") == "on-device")
        ctx.close()

        # ───────────── B. Nano needs download ─────────────
        print("B. Nano downloadable")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        route_stubs(ctx, configured=False)
        ctx.add_init_script("window.LanguageModel = { availability: async () => 'downloadable' };")
        page = ctx.new_page(); page.goto(base); page.wait_for_selector("#route .flow")
        pick_sample(page, "lab")
        page.click("#btnAnalyze"); page.wait_for_selector("#dlgSetup[open]")
        check("pinned request opens the Nano setup dialog", True)
        shot(page, "10-setup")
        page.click("#btnDownload"); page.wait_for_function("window.__nanoDownloaded === true")
        check("download button calls initializeDeviceModel", True)
        ctx.close()

        # ───────────── C. no Prompt API at all → cloud ─────────────
        print("C. no Nano in this browser")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        route_stubs(ctx, configured=False)
        page = ctx.new_page(); page.goto(base); page.wait_for_selector("#route .flow")
        pick_sample(page, "scam")
        check("without Nano a sensitive text goes to cloud, masked", page.get_attribute("#route", "data-route") == "cloud" and "masked" in page.inner_text("#route").lower())
        page.click("#btnAnalyze"); page.wait_for_selector("#badge.cloud")
        c = [x for x in page.evaluate("window.__calls") if x["structured"]][-1]
        check("scam sample CNIC/e-mail masked before cloud", "42101-9988776-5" not in c["prompt"] and "support@hbl-secure-verify.com" not in c["prompt"])
        ctx.close()

        # ───────────── D. configured Firebase: auth, App Check, RC, Firestore ─────────────
        print("D. configured project")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        route_stubs(ctx, configured=True)
        ctx.add_init_script("window.LanguageModel = { availability: async () => 'available' }; window.__rcOverrides = { force_mode: 'only_in_cloud', cloud_model: 'gemini-test-model' };")
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base); page.wait_for_selector("#route .flow"); page.wait_for_timeout(400)
        check("no banner when configured", not page.is_visible("#banner"))
        ac = page.evaluate("window.__appCheck")
        check("App Check initialised with debug token + provider", ac and page.evaluate("self.FIREBASE_APPCHECK_DEBUG_TOKEN") == "11111111-2222-3333-4444-555555555555")
        pick_sample(page, "rent")
        check("Remote Config force_mode kill-switch overrides routing", "only_in_cloud" in page.inner_text("#route") and "Remote Config" in page.inner_text("#route"), page.inner_text("#route")[:300])
        page.click("#btnAnalyze"); page.wait_for_selector("#result:not([hidden])")
        c = [x for x in page.evaluate("window.__calls") if x["structured"]][-1]
        check("Remote Config cloud_model reached the SDK call", c["cloudModel"] == "gemini-test-model", c["cloudModel"])
        check("kill-switch still masked the CNIC", "42101-8765432-1" not in c["prompt"])
        page.click("#btnSave"); page.wait_for_function("document.querySelector('#btnSave').textContent.includes('Saved')")
        saved = page.evaluate("[...window.__fs.entries()].filter(([k]) => k.includes('/analyses/')).map(([k,v]) => v)")
        check("Firestore got the explanation", len(saved) == 1 and saved[0]["docType"].lower() == "rental agreement")
        check("Firestore record has NO raw document text", "rawText" not in saved[0] and "42101-8765432-1" not in json.dumps(saved[0]))
        led = page.evaluate("window.__fs.get('users/u-test/stats/privacy')")
        check("Privacy Ledger counters incremented atomically", led and led["runs"] == 1 and led["cloud"] == 1 and led["masked"] >= 3, led)
        page.click("#btnLibrary"); page.wait_for_timeout(200)
        check("library lists the saved item", "rental agreement" in page.inner_text("#libList").lower())
        shot(page, "11-library")
        page.click("#btnCloseDrawer")
        page.click("#btnSettings"); page.wait_for_timeout(100)
        check("diagnostics show Remote Config fetched", "fetched from server" in page.inner_text("#diag"))
        shot(page, "12-settings")
        check("no page errors (configured)", not errors, errors)
        ctx.close()

        # ───────────── E. responsive + dark mode shots ─────────────
        print("E. responsive/dark")
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block", color_scheme="dark", is_mobile=True, device_scale_factor=2)
        route_stubs(ctx, configured=False)
        ctx.add_init_script("window.LanguageModel = { availability: async () => 'available' };")
        page = ctx.new_page(); page.goto(base); page.wait_for_selector("#route .flow")
        pick_sample(page, "lab"); page.click("#btnAnalyze"); page.wait_for_selector("#result:not([hidden])")
        overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
        check("no horizontal overflow on a 390px phone", not overflow)
        shot(page, "13-mobile-dark")
        ctx.close()
        browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

run()
