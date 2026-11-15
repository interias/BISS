"""Build the 90-second 9:16 reel from marketing/reel/reel.html.

Usage: python marketing/reel/build_reel.py [vo [id ...] | music | video | all]
  vo     voice-over lines via OpenRouter (ElevenLabs), one MP3 per line in audio/
  music  a 90-second backing track via OpenRouter (Lyria), audio/music.mp3
  video  lays the frame from reel.html over the filmed app (out/app.mp4 and out/capture.json
         from capture_app.py), mixes voice, music and tap sounds, and writes
         out/biss-reel.mp4 (1080 x 1920, 30 fps, H.264 + AAC, fits WhatsApp)
  all    vo and music (video stays separate: it needs a fresh capture first)
Reads OPENROUTER_API_KEY from the repo's .env, needs ffmpeg, numpy and Python Playwright.
"""
import base64
import json
import pathlib
import subprocess
import sys
import urllib.request

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
AUDIO, OUT = HERE / "audio", HERE / "out"
API = "https://openrouter.ai/api/v1"
VOICE_MODEL = "elevenlabs/eleven-v4"
VOICE, USER_VOICE = "sarah", "george"
MUSIC_MODEL = "google/lyria-3-pro-preview"
T, FPS, W, H, SR = 90, 30, 540, 960, 44100

# One line per id; the ids and start times live in reel.html (VO).
LINES = {
    "intro": "[warmly] Essen eintragen? Mit BISS geht das schneller, als du denkst.",
    "recent": "Morgens die Haferflocken: ein Tap auf den Chip. Fertig.",
    "combo": "Dein festes Frühstück ist ein Schnellzugriff. Auch nur ein Tap.",
    "empty": "Suche öffnen, und BISS weiß schon, was du wahrscheinlich willst.",
    "search": "Etwas Neues? Kurz tippen, Treffer wählen, die Menge steht schon da.",
    "barcode": "Packung vor die Kamera. Der Barcode wird erkannt, ganz ohne Auslösen.",
    "label": "Unbekanntes Produkt? Ein Foto vom Etikett, und die Nährwerte sind drin.",
    "plate": "[impressed] Sogar dein Teller wird erkannt. Zutaten, Mengen, eine Bestätigung.",
    "dictate": "[excited] Ganz neu: Sag einfach, was du gegessen hast.",
    "user": "Zwei Scheiben Brot mit Käse und ein Kaffee.",
    "dictate2": "BISS macht daraus ein Gericht. Kurz prüfen, eintragen.",
    "recipe": "Deine eigenen Rezepte? Kochbuch auf, Lasagne wählen, eine Portion.",
    "addfood": "Noch eine Banane zum Frühstück? Gericht aufklappen, Zutat ergänzen.",
    "finale": "Zehn Wege, Essen einzutragen. Tippen, scannen oder einfach sprechen.",
    "outro": "[excited] BISS. Weniger tippen. Mehr genießen.",
}

MUSIC_PROMPT = (
    "Instrumental only, no vocals. A bright, motivating electro-pop track for a 90-second app "
    "promo reel, about 118 BPM in a major key. Plucky synths, punchy kick, claps and a warm bass. "
    "Start with a short light intro, keep a steady positive groove that leaves room for a voice-over, "
    "build a small lift around 50 seconds, a joyful climax around 80 seconds, and end cleanly at 90 seconds."
)


def key() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("OPENROUTER_API_KEY missing in .env")


def request(path: str, body: dict) -> urllib.request.Request:
    return urllib.request.Request(API + path, data=json.dumps(body).encode(),
                                  headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"})


def ffmpeg(*args: str, stdin=None) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True, stdin=stdin)


def voice(ids: list[str]) -> None:
    for i in ids or LINES:
        body = {"model": VOICE_MODEL, "voice": USER_VOICE if i == "user" else VOICE, "input": LINES[i], "response_format": "mp3"}
        with urllib.request.urlopen(request("/audio/speech", body), timeout=600) as res:
            audio = res.read()
        raw = AUDIO / f"vo-{i}.raw.mp3"
        raw.write_bytes(audio)
        ffmpeg("-i", str(raw), "-af", "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-15:TP=-1.5:LRA=11",
               "-ar", str(SR), "-b:a", "160k", str(AUDIO / f"vo-{i}.mp3"))
        raw.unlink()
        print("vo", i, f"{duration(AUDIO / f'vo-{i}.mp3'):.2f}s")


def music() -> None:
    # Audio output only comes as a stream of server-sent events with base64 chunks.
    body = {"model": MUSIC_MODEL, "modalities": ["text", "audio"], "stream": True,
            "messages": [{"role": "user", "content": MUSIC_PROMPT}]}
    chunks, text = [], []
    with urllib.request.urlopen(request("/chat/completions", body), timeout=900) as res:
        for line in res:
            line = line.decode().strip()
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            delta = json.loads(line[6:]).get("choices", [{}])[0].get("delta", {})
            audio = delta.get("audio") or {}
            if audio.get("data"):
                chunks.append(audio["data"])
            text.append(delta.get("content") or audio.get("transcript") or "")
    if not chunks:
        sys.exit("no audio in stream: " + "".join(text)[:800])
    raw = AUDIO / "music.raw"
    raw.write_bytes(base64.b64decode("".join(chunks)))
    ffmpeg("-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), "-b:a", "192k", str(AUDIO / "music.mp3"))
    raw.unlink()
    print("music", f"{duration(AUDIO / 'music.mp3'):.1f}s", "".join(text)[:200])


def duration(path: pathlib.Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def pcm(path: pathlib.Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def blip(f: float, d: float, g: float, shape: str = "sine") -> np.ndarray:
    t = np.arange(int(d * SR)) / SR
    freq = f * (0.7 ** (t / d))
    phase = 2 * np.pi * np.cumsum(freq) / SR
    wave = np.sign(np.sin(phase)) * .5 if shape == "square" else (2 / np.pi) * np.arcsin(np.sin(phase)) if shape == "triangle" else np.sin(phase)
    return (wave * g * np.exp(-5 * t / d)).astype(np.float32)


def place(track: np.ndarray, clip: np.ndarray, at: float) -> None:
    i = int(at * SR)
    n = min(len(clip), len(track) - i)
    if n > 0:
        track[i:i + n] += clip[:n]


def mix(tl: dict) -> pathlib.Path:
    n = T * SR
    vo, sfx = np.zeros(n, np.float32), np.zeros(n, np.float32)
    for v in tl["vo"]:
        place(vo, pcm(AUDIO / f"vo-{v['id']}.mp3"), v["start"])
    for t in tl["taps"]:
        place(sfx, blip(760, .06, .10), t)
    for t in tl["entries"]:
        place(sfx, blip(1047, .12, .06, "triangle"), t)
        place(sfx, blip(1568, .18, .05, "triangle"), t + .07)
    for t in tl["shutters"]:
        place(sfx, blip(2400, .05, .06, "square"), t)

    m = pcm(AUDIO / "music.mp3")
    m = np.pad(m, (0, max(0, n - len(m))))[:n]
    fade = np.ones(n, np.float32)
    fade[:int(.6 * SR)] = np.linspace(0, 1, int(.6 * SR))
    fade[-int(2.5 * SR):] = np.linspace(1, 0, int(2.5 * SR))
    # Duck the music under the voice: a smoothed envelope of where any voice line sounds.
    busy = np.zeros(n, np.float32)
    for v in tl["vo"]:
        a, b = int((v["start"] - .15) * SR), int((v["start"] + v["dur"] + .1) * SR)
        busy[max(0, a):b] = 1
    k = int(.25 * SR)
    busy = np.convolve(busy, np.ones(k, np.float32) / k, mode="same")
    music_gain = .8 - .5 * busy
    out = m * music_gain * fade + vo + sfx
    out /= max(1.0, float(np.abs(out).max()) / .97)
    wav = OUT / "mix.wav"
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                          "-af", "loudnorm=I=-14:TP=-1:LRA=11", "-ar", str(SR), str(wav)], stdin=subprocess.PIPE)
    p.communicate(out.astype(np.float32).tobytes())
    return wav


def video() -> None:
    """The frame from reel.html (transparent where the phone's screen is) over out/app.mp4."""
    from playwright.sync_api import sync_playwright
    cap = json.loads((OUT / "capture.json").read_text(encoding="utf-8"))
    silent = OUT / "frames.mp4"
    durs = {v: duration(AUDIO / f"vo-{v}.mp3") for v in LINES if (AUDIO / f"vo-{v}.mp3").exists()}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
        page.goto((HERE / "reel.html").as_uri() + "?capture")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(500)
        tl = page.evaluate("([c, d]) => window.REEL.setup(c, d)", [cap, durs])
        for v in tl["vo"]:   # a line must end before the next one starts
            nxt = [w["start"] for w in tl["vo"] if w["start"] > v["start"]]
            if nxt and v["start"] + v["dur"] > min(nxt) - .1:
                print(f"warning: vo-{v['id']} ({v['dur']:.2f}s) runs into the next line")
        hole = {k: round(v * 2) for k, v in tl["hole"].items()}
        enc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-y", "-i", str(OUT / "app.mp4"), "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
             "-filter_complex", f"color=c=black:s={W * 2}x{H * 2}:r={FPS}:d={T}[bg];"
             f"[0]scale={hole['w']}:{hole['h']}[app];[bg][app]overlay={hole['x']}:{hole['y']}[base];[base][1]overlay=format=auto",
             "-t", str(T), "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", str(silent)],
            stdin=subprocess.PIPE)
        for f in range(T * FPS):
            page.evaluate("t => window.REEL.render(t)", f / FPS)
            enc.stdin.write(page.screenshot(type="png", omit_background=True))
            if f % 150 == 0:
                print("frame", f, flush=True)
        enc.stdin.close()
        enc.wait()
        browser.close()
    taps = cap["taps"]
    tl["taps"] = [x["t"] for x in taps]
    tl["entries"] = [x["t"] + .25 for x in taps if x["label"] in ("chip", "combo", "eintragen")]
    tl["shutters"] = [x["t"] + .05 for x in taps if x["label"] == "trigger"]
    wav = mix(tl)
    target = OUT / "biss-reel.mp4"
    ffmpeg("-i", str(silent), "-i", str(wav), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
           "-movflags", "+faststart", "-shortest", str(target))
    print("video", target, f"{target.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    AUDIO.mkdir(exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("vo", "all"):
        voice(sys.argv[2:] if what == "vo" else [])
    if what in ("music", "all"):
        music()
    if what == "video":
        video()
