"""Voice-over for the social clips (assets/video/social/).

The picture is unchanged (the on-screen words stay, as captions for people watching
with the sound off); this only adds a narration track, timed to the scenes in
social.html, and writes ...-voice.mp4 next to each clip.

    python3 voiceover.py <kokoro folder | piper voice.onnx> [email question invoice]
    VO_VOICE=bf_emma (default) | af_heart | …   VO_TAG=-suffix   VO_OUT=folder

Voices: Piper (offline, https://github.com/rhasspy/piper). The model files are not in
the repo; download one from the piper v0.0.2 release, e.g. voice-en-us-ryan-high.tar.gz.
Each line starts at its planned time (the scene it belongs to) or, if the line before
runs long, 0.25 s after it; the clip is 21 s and the last line must end by then.
"""
import json, os, subprocess, sys, tempfile, wave

FF = os.environ.get("FF", "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "video", "social")
DUR = 21.0

# (start time in seconds, words). Times match T in social.html:
# hook 0.2, comes in 4.0, AI 7.6, ready 10.0, check 13.6, time 14.8, end card 17.2.
END = "Re-Charge. Book your free call at re-charge dot co dot zed a!"
LINES = {
    "email": [
        (0.4, "Still answering the same emails... all day?"),
        (4.2, "A customer wants a price, and a date."),
        (7.7, "So AI reads it, and writes the reply!"),
        (11.0, "It's ready for you. Just check it, and hit send."),
        (14.9, "Fifteen minutes? Now it's two."),
        (17.0, END),
    ],
    "question": [
        (0.4, "Is your team asking the same questions, every day?"),
        (4.2, "Can I give this client sixty days to pay?"),
        (7.7, "AI finds the answer in your own documents!"),
        (11.0, "Only with the finance manager's OK. And it shows where it found it."),
        (14.9, "Ten minutes? Now it's under one."),
        (17.0, END),
    ],
    "invoice": [
        (0.4, "Still typing invoices in by hand?"),
        (4.2, "A supplier invoice lands in your inbox."),
        (7.7, "AI types it into your accounts, and checks every price!"),
        (11.0, "Twelve boxes billed, only ten arrived. Flagged for you."),
        (14.9, "Six minutes? Now it's one."),
        (17.0, END),
    ],
}
FORMATS = {"4x5-feed": "4x5-feed", "9x16-reels": "9x16-reels"}


# Kokoro (much more natural; https://github.com/thewh1teagle/kokoro-onnx): pass the folder with
# kokoro-v1.0.onnx and voices-v1.0.bin as <voice>, and pick the voice with VO_VOICE (default bf_emma,
# British English, closest to how South Africans speak). Anything else is treated as a Piper .onnx model.
_KOKORO = None
# Heart is Kokoro's most expressive voice; a little Bella adds energy. Slightly quick = upbeat.
DEFAULT_VOICE, DEFAULT_SPEED = "af_heart*0.65+af_bella*0.35", "1.08"
# Studio polish on the narration: cut rumble, even out the level, add presence and a touch of room.
VOICE_FX = "highpass=f=90,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2,equalizer=f=3200:t=q:w=1.2:g=3,equalizer=f=250:t=q:w=1:g=-2,aecho=0.8:0.5:28|46:0.10|0.06"
def synth(model, text, path):
    global _KOKORO
    if os.path.isdir(model):
        import soundfile as sf
        from kokoro_onnx import Kokoro
        if _KOKORO is None: _KOKORO = Kokoro(os.path.join(model, "kokoro-v1.0.onnx"), os.path.join(model, "voices-v1.0.bin"))
        spec = os.environ.get("VO_VOICE", DEFAULT_VOICE)
        parts = [(p.split("*")[0], float(p.split("*")[1]) if "*" in p else 1.0) for p in spec.split("+")]
        style = sum(_KOKORO.get_voice_style(v) * w for v, w in parts) / sum(w for _, w in parts) if len(parts) > 1 else parts[0][0]
        audio, sr = _KOKORO.create(text, voice=style, speed=float(os.environ.get("VO_SPEED", DEFAULT_SPEED)),
                                   lang="en-gb" if parts[0][0].startswith("b") else "en-us", sentence_pause=0.18, clause_pause=0.08)
        sf.write(path, audio, sr)
        return len(audio) / sr
    return synth_piper(model, text, path)


def synth_piper(model, text, path):
    subprocess.run([sys.executable, "-I", "-m", "piper", "-m", model, "-c", model + ".json",
                    "-f", path, "--length-scale", "1.05", "--sentence-silence", "0.15"],
                   input=text.encode(), check=True, capture_output=True)
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def main():
    model, eps = sys.argv[1], sys.argv[2:] or list(LINES)
    for ep in eps:
        with tempfile.TemporaryDirectory() as tmp:
            parts, t_free = [], 0.0
            for i, (start, text) in enumerate(LINES[ep]):
                p = os.path.join(tmp, f"{i}.wav")
                d = synth(model, text, p)
                at = max(start, t_free + 0.25)
                parts.append((at, p, d)); t_free = at + d
            if t_free > DUR:
                print(f"warning: {ep} narration runs to {t_free:.1f}s, past {DUR}s")
            print(ep, json.dumps([(round(a, 2), round(d, 2)) for a, _, d in parts]))
            # one narration track: each line delayed to its start, mixed, padded to the clip length
            inputs, filters = [], []
            for i, (at, p, _) in enumerate(parts):
                inputs += ["-i", p]
                ms = int(at * 1000)
                filters.append(f"[{i}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
            mix = "".join(f"[a{i}]" for i in range(len(parts)))
            filters.append(f"{mix}amix=inputs={len(parts)}:normalize=0,{VOICE_FX},loudnorm=I=-16:TP=-1.5:LRA=7,apad,atrim=0:{DUR}[vo]")
            vo = os.path.join(tmp, "vo.wav")
            subprocess.run([FF, "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[vo]", "-ac", "2", "-ar", "48000", vo], check=True)
            for fmt in FORMATS:
                src = os.path.join(OUT, f"re-charge-{ep}-{fmt}.mp4")
                dst = os.path.join(os.environ.get("VO_OUT", OUT), f"re-charge-{ep}-{fmt}-voice{os.environ.get('VO_TAG', '')}.mp4")
                subprocess.run([FF, "-loglevel", "error", "-y", "-i", src, "-i", vo, "-map", "0:v", "-map", "1:a",
                                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", dst], check=True)
                print("  ->", os.path.basename(dst))


if __name__ == "__main__":
    main()
