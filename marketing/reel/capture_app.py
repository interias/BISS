"""Film the real app for the reel, scene by scene, against the demo stack.

Usage: python marketing/reel/capture_app.py [base] [--probe [scene ...]]
  base     the demo stack's web, default http://127.0.0.1:2577 (never the own stack)
  --probe  no film, a screenshot after every tap into out/probe/ to check the steps

Each scene gets a fresh browser (the fake camera is one file per browser) on the same
server-side day, so cuts between scenes show the same state. The label, plate and dictation
answers come from capture/*.json, real model answers fetched once, after a fixed wait, so
the loading screens fit the reel's timing. Writes out/app.mp4 (768 x 1520, 30 fps, no sound)
and out/capture.json (scenes, taps with their place on the screen, the day's totals).
"""
import asyncio
import base64
import json
import pathlib
import re
import subprocess
import sys
import time

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT, CAM = HERE / "out", HERE / "out" / "cam"
W, H, FPS = 384, 760, 30
args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = args[0] if args and args[0].startswith("http") else "http://127.0.0.1:2577"
PROBE = "--probe" in sys.argv
ONLY = [a for a in args if not a.startswith("http")]

# Camera pictures, all free to use: our own invented label, CC0 / public-domain photos.
PHOTOS = {
    # The camera pans down the pack and reaches the barcode after about 1.3 s; the app reads a
    # barcode at once, so without the pan the live picture would show for a single frame.
    "barcode": (ROOT / "api/tests/fixtures/real/barcodes/sandwich-be.jpg",
                "crop=iw:iw*1.6:0:'(ih-iw*1.6)*clip((t-0.3)/1.0,0,1)'"),
    "label": (ROOT / "api/tests/fixtures/labels/oat_drink.png", "crop=iw:ih:0:0"),
    "plate": (ROOT / "api/tests/fixtures/real/plates/falafel-bowl.jpg", "crop=ih*0.5625:ih"),
}

SPEECH = """
(() => {
  const speech = {instances: []};
  class Recognition {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; speech.instances.push(this); }
    start() {}
    stop() { setTimeout(() => this.onend && this.onend()); }
    abort() { setTimeout(() => { this.onerror && this.onerror({error: 'aborted'}); this.onend && this.onend(); }); }
  }
  // Speaks a sentence word by word as interim results, the last one final.
  speech.say = (text, ms) => {
    const words = text.split(' '), r = speech.instances[speech.instances.length - 1];
    words.forEach((_, i) => setTimeout(() => r.onresult && r.onresult({resultIndex: 0,
      results: [{isFinal: i === words.length - 1, 0: {transcript: words.slice(0, i + 1).join(' ')}}]}), i * ms));
  };
  window.bissSpeech = speech;
  Object.defineProperty(window, 'SpeechRecognition', {value: Recognition, configurable: true});
  Object.defineProperty(window, 'webkitSpeechRecognition', {value: Recognition, configurable: true});
})();
"""


def camera_file(kind: str) -> pathlib.Path:
    CAM.mkdir(parents=True, exist_ok=True)
    out = CAM / f"{kind}.y4m"
    src, crop = PHOTOS[kind]
    if not out.exists() or out.stat().st_mtime < pathlib.Path(__file__).stat().st_mtime:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(src), "-t", "3", "-r", "15", "-vf",
                        f"{crop},scale=720:1280:force_original_aspect_ratio=decrease,"
                        "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x2a3330,format=yuv420p", str(out)], check=True)
    return out


class Scene:
    """One scene's clock, its taps and its film."""

    def __init__(self, sid: str, start: float, end: float, page, cdp):
        self.id, self.start, self.end, self.page, self.cdp = sid, start, end, page, cdp
        self.taps, self.frames, self.t0 = [], [], 0.0

    def now(self) -> float:
        return time.monotonic() - self.t0

    async def at(self, t: float) -> None:
        if (d := t - self.now()) > 0:
            await asyncio.sleep(d)

    async def reveal(self, loc, below: float) -> None:
        """Scroll by wheel, as a thumb would, until the element is on the screen and above
        `below` px from the bottom (the dock covers the diary's last 170 px)."""
        last = None
        for _ in range(80):
            box = await loc.bounding_box()
            if box["y"] >= 40 and box["y"] + box["height"] <= H - below or box["y"] == last:
                return   # in view, or fixed (the dock) and scrolling does not move it
            last = box["y"]
            await self.page.mouse.move(W / 2, H * .6)
            await self.page.mouse.wheel(0, 50 if box["y"] > 40 else -50)
            await asyncio.sleep(.016)

    async def tap(self, loc, t: float, label: str, below: float = 20) -> None:
        try:
            await loc.wait_for(state="visible", timeout=15000)
        except Exception:
            await self.page.screenshot(path=str(OUT / f"failed-{self.id}-{label}.png"))
            raise
        await self.at(t - .8)
        await self.reveal(loc, below)
        await self.at(t)
        box = await loc.bounding_box()
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        self.taps.append({"t": round(self.start + self.now(), 3), "x": round(x, 1), "y": round(y, 1), "label": label})
        await self.page.mouse.click(x, y)
        if PROBE:
            await asyncio.sleep(.9)
            await self.page.screenshot(path=str(OUT / "probe" / f"{self.id}-{len(self.taps)}-{label}.png"))

    async def type(self, text: str, t: float) -> None:
        await self.at(t)
        await self.page.keyboard.type(text, delay=170)


def dialog(page):
    return page.get_by_role("dialog")


async def eintragen(s: Scene, t: float) -> None:
    await s.tap(dialog(s.page).get_by_role("button", name=re.compile(r"^Eintragen")), t, "eintragen")


# The scenes: id, start and end in the reel, camera picture, and the actions with their times
# inside the scene. Budgets as in SPEC 1.
async def recent(s):
    await s.tap(s.page.get_by_role("button", name=re.compile(r"^Haferflocken")), 2.4, "chip")


async def combo(s):
    await s.tap(s.page.get_by_role("button", name="Schnellzugriff Frühstück"), 2.4, "combo")


async def empty(s):
    await s.tap(s.page.get_by_role("button", name="Lebensmittel suchen"), 1.6, "search")
    await s.tap(dialog(s.page).get_by_role("button", name=re.compile(r"^Apfel roh")).first, 3.0, "suggestion")
    await eintragen(s, 4.6)


async def search(s):
    await s.tap(s.page.get_by_role("button", name="Lebensmittel suchen"), 1.4, "search")
    await s.type("Ei", 2.0)
    await s.tap(dialog(s.page).get_by_role("button", name=re.compile(r"^Hühnerei gekocht")).first, 3.6, "hit")
    await eintragen(s, 5.4)


async def barcode(s):
    await s.tap(s.page.get_by_role("button", name="Kamera: Barcode, Etikett oder Teller"), 1.0, "camera")
    await eintragen(s, 4.6)


async def label(s):
    await s.tap(s.page.get_by_role("button", name="Kamera: Barcode, Etikett oder Teller"), 1.0, "camera")
    await s.tap(s.page.get_by_role("button", name=re.compile(r"^Etikett")), 2.1, "trigger")
    await s.tap(dialog(s.page).get_by_role("button", name="Speichern"), 5.6, "save")
    await eintragen(s, 6.8)


async def plate(s):
    await s.tap(s.page.get_by_role("button", name="Kamera: Barcode, Etikett oder Teller"), 1.0, "camera")
    await s.tap(s.page.get_by_role("button", name=re.compile(r"^Teller")), 2.1, "trigger")
    await eintragen(s, 6.0)


async def dictate(s):
    await s.tap(s.page.get_by_role("button", name="Mahlzeit diktieren"), 3.2, "mic")
    await s.at(4.0)
    await s.page.evaluate("window.bissSpeech.say('Zwei Scheiben Brot mit Käse und ein Kaffee', 330)")
    await s.tap(dialog(s.page).get_by_role("button", name="Fertig"), 7.6, "fertig")
    await eintragen(s, 11.2)


async def recipe(s):
    await s.tap(s.page.get_by_role("button", name="Meine Rezepte"), 1.2, "book")
    await s.tap(dialog(s.page).get_by_role("button", name=re.compile(r"Lasagne")).first, 2.6, "recipe")
    await eintragen(s, 4.4)


async def addfood(s):
    await s.tap(s.page.locator("button[aria-expanded]").filter(has_text="Frühstück").first, 1.4, "group", 170)
    await s.tap(s.page.get_by_role("button", name="+ Zutat"), 2.6, "add", 170)
    await s.type("Banane", 3.0)
    await s.tap(dialog(s.page).get_by_role("button", name=re.compile(r"^Banane roh")).first, 4.6, "hit")
    await eintragen(s, 6.2)


async def idle(s):
    pass


SCENES = [
    ("intro", 0, 5, None, idle), ("recent", 5, 11, None, recent), ("combo", 11, 17, None, combo),
    ("empty", 17, 23, None, empty), ("search", 23, 30, None, search), ("barcode", 30, 36, "barcode", barcode),
    ("label", 36, 44, "label", label), ("plate", 44, 51, "plate", plate), ("dictate", 51, 63, None, dictate),
    ("recipe", 63, 69, None, recipe), ("addfood", 69, 76, None, addfood), ("finale", 76, 90, None, idle),
]
ANSWERS = {"labels/extract": ("label", 2.2), "plates/extract": ("plate", 2.4), "plates/dictate": ("dictate", 2.0)}


async def run_scene(pw, sid, start, end, cam, act) -> Scene:
    flags = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
    if cam:
        flags.append(f"--use-file-for-fake-video-capture={camera_file(cam)}")
    browser = await pw.chromium.launch(args=flags)
    ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, color_scheme="light",
                                    locale="de-DE", timezone_id="Europe/Berlin", permissions=["camera", "microphone"])
    await ctx.add_init_script(SPEECH)
    page = await ctx.new_page()

    async def answer(route):
        path = route.request.url.split("/api/v1/")[1]
        name, wait = ANSWERS[path]
        await asyncio.sleep(wait)
        await route.fulfill(status=200, content_type="application/json",
                            body=(HERE / "capture" / f"{name}.json").read_text(encoding="utf-8"))
    for path in ANSWERS:
        await page.route(f"**/api/v1/{path}", answer)

    await page.goto(BASE)
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(600)
    cdp = await ctx.new_cdp_session(page)
    s = Scene(sid, start, end, page, cdp)

    def frame(e):
        s.frames.append((e["metadata"]["timestamp"], e["data"]))
        asyncio.ensure_future(cdp.send("Page.screencastFrameAck", {"sessionId": e["sessionId"]}))
    if not PROBE:
        cdp.on("Page.screencastFrame", frame)
        first = base64.b64encode(await page.screenshot(type="jpeg", quality=92)).decode()
        await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W * 2, "maxHeight": H * 2})
    s.t0, wall = time.monotonic(), time.time()
    if not PROBE:
        s.frames.insert(0, (wall - 1, first))
    await act(s)
    await s.at(end - start)
    if not PROBE:
        await cdp.send("Page.stopScreencast")
        s.frames = [(ts - wall, data) for ts, data in s.frames]
    await browser.close()
    print(sid, "taps", len(s.taps), "frames", len(s.frames), flush=True)
    return s


async def main() -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / "probe").mkdir(exist_ok=True)
    if not ONLY:   # single scenes run on the day as it is
        subprocess.run([sys.executable, str(HERE / "seed.py"), BASE + "/api/v1"], check=True)
    scenes = []
    async with async_playwright() as pw:
        for sid, start, end, cam, act in SCENES:
            if ONLY and sid not in ONLY:
                continue
            scenes.append(await run_scene(pw, sid, start, end, cam, act))
    if PROBE:
        return
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
                            "-vf", f"scale={W * 2}:{H * 2}", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
                            str(OUT / "app.mp4")], stdin=subprocess.PIPE)
    for s in scenes:   # the last frame shown at each tick of the reel's clock
        i = 0
        for k in range(round((s.end - s.start) * FPS)):
            while i + 1 < len(s.frames) and s.frames[i + 1][0] <= k / FPS:
                i += 1
            enc.stdin.write(base64.b64decode(s.frames[i][1]))
    enc.stdin.close()
    enc.wait()
    import urllib.request
    day = json.load(urllib.request.urlopen(BASE + "/api/v1/days/today"))
    (OUT / "capture.json").write_text(json.dumps({
        "scenes": [{"id": s.id, "start": s.start, "end": s.end} for s in scenes],
        "taps": [dict(t, scene=s.id) for s in scenes for t in s.taps],
        "totals": day["totals"], "targets": day["targets"]}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("app.mp4 and capture.json written")


if __name__ == "__main__":
    asyncio.run(main())
