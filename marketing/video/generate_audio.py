"""Generate the voice-over and music for marketing/video/index.html via OpenRouter.

Usage: python marketing/video/generate_audio.py [vo [scene ...] | music | bundle]   (default: vo and music)
Reads OPENROUTER_API_KEY from the repo's .env, needs ffmpeg. Writes MP3 files to marketing/video/audio/.
"bundle" writes marketing/video/biss-in-60-sekunden.html: one file with all audio inlined, no server needed.
"""
import base64
import json
import pathlib
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent / "audio"
API = "https://openrouter.ai/api/v1"
VOICE_MODEL = "elevenlabs/eleven-v4"
VOICE = "sarah"
MUSIC_MODEL = "google/lyria-3-pro-preview"
MUSIC_OFFSET = 6
BUNDLE = "biss-in-60-sekunden.html"

# One line per scene; the ids match the scenes in index.html.
LINES = {
    "intro": "[warmly] Essen eintragen? Das geht schneller, als du denkst.",
    "recent": "[excited] Einmal tippen, und die Haferflocken sind eingetragen.",
    "combo": "Dein ganzes Frühstück? Auch nur einmal tippen.",
    "search": "Etwas Neues? Kurz suchen, Menge wählen, fertig.",
    "barcode": "Packung vor die Kamera, und die Werte sind sofort da.",
    "label": "Unbekanntes Produkt? Ein Foto vom Etikett reicht.",
    "plate": "[impressed] Sogar dein Teller wird erkannt. Zutaten, Mengen, eine Bestätigung.",
    "recipe": "Und deine eigenen Rezepte? Einmal anlegen und in Portionen eintragen.",
    "finale": "[excited] BISS. Weniger tippen. Mehr genießen.",
}

MUSIC_PROMPT = (
    "Instrumental only, no vocals. A bright, motivating electro-pop track for a 60-second app "
    "promo video, about 120 BPM in a major key. Plucky synths, punchy kick, claps and a warm bass. "
    "Start with a short light intro, keep a steady positive groove that leaves room for a voice-over, "
    "lift the energy around 50 seconds into a joyful climax, and end cleanly at 60 seconds."
)


def key() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("OPENROUTER_API_KEY missing in .env")


def request(path: str, body: dict) -> urllib.request.Request:
    return urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"},
    )


def post(path: str, body: dict) -> bytes:
    with urllib.request.urlopen(request(path, body), timeout=600) as res:
        return res.read()


def normalize(raw: pathlib.Path, out: pathlib.Path, filters: str, args: list[str] = ()) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-i", str(raw), "-af", filters,
                    "-ar", "44100", "-b:a", "160k", str(out)], check=True)
    raw.unlink()


def voice(scenes: list[str]) -> None:
    for scene in scenes or LINES:
        audio = post("/audio/speech", {"model": VOICE_MODEL, "voice": VOICE, "input": LINES[scene], "response_format": "mp3"})
        raw = OUT / f"vo-{scene}.raw.mp3"
        raw.write_bytes(audio)
        normalize(raw, OUT / f"vo-{scene}.mp3", "loudnorm=I=-15:TP=-1.5:LRA=11")
        print("vo", scene, len(audio))


def music() -> None:
    # Audio output only comes as a stream of server-sent events with base64 chunks.
    body = {
        "model": MUSIC_MODEL,
        "modalities": ["text", "audio"],
        "stream": True,
        "messages": [{"role": "user", "content": MUSIC_PROMPT}],
    }
    chunks, text, fmt = [], [], None
    with urllib.request.urlopen(request("/chat/completions", body), timeout=600) as res:
        for line in res:
            line = line.decode().strip()
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            delta = json.loads(line[6:]).get("choices", [{}])[0].get("delta", {})
            audio = delta.get("audio") or {}
            if audio.get("data"):
                chunks.append(audio["data"])
            fmt = audio.get("format") or fmt
            text.append(delta.get("content") or audio.get("transcript") or "")
    if not chunks:
        sys.exit("no audio in stream: " + "".join(text)[:800])
    raw = OUT / "music.raw"
    raw.write_bytes(base64.b64decode("".join(chunks)))
    print("music", raw.stat().st_size, fmt, "".join(text)[:200])
    # The first take ran 70 s with its climax at 52 s; starting at 6 s puts the climax at 46 s
    # and the song's own ending at 60 s. Check the loudness curve again after a new take.
    normalize(raw, OUT / "music.mp3",
              "afade=t=in:d=0.6,afade=t=out:st=58.5:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11",
              ["-ss", str(MUSIC_OFFSET), "-t", "60"])


def bundle() -> None:
    """Write a single HTML file with all audio inlined, playable offline from disk."""
    page = (OUT.parent / "index.html").read_text(encoding="utf-8")
    audio = {f.stem: base64.b64encode(f.read_bytes()).decode() for f in sorted(OUT.glob("*.mp3"))}
    marker = "<script>\n'use strict';"
    assert marker in page
    page = page.replace(marker, f"<script>window.BISS_AUDIO={json.dumps(audio)};</script>\n{marker}", 1)
    target = OUT.parent / BUNDLE
    target.write_text("<!doctype html>\n<html lang=\"de\">\n" + page, encoding="utf-8")
    print("bundle", target, target.stat().st_size)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "both"
    if what == "bundle":
        bundle()
    if what in ("vo", "both"):
        voice(sys.argv[2:])
    if what in ("music", "both"):
        music()
