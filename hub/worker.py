#!/usr/bin/env python3
"""Re-Charge hub worker: the office PC's AI, for the website and the admin panel.

It does two jobs, both by calling OUT to the website's backend (the PC is never reachable from the
internet, and needs no address, tunnel or open port):

1. Website and panel answers (the hub-jobs function). It keeps asking "anything for me?". Each
   question from the website chat, the demos, "try it on your own email", or the panel's sorting
   and drafting is collected within a second, answered by the local model (LM Studio) and handed
   back. Each check-in also tells the website the PC is on and whether LM Studio is answering.
2. Call recordings (the call-jobs function). When one is waiting, it downloads it, transcribes it
   with the local Whisper server, has the local model write the call notes, and sends both back.
   The recording never goes to an outside AI.

The two run side by side, so a long call never holds up a website visitor.

Run:   python worker.py        (start-hub.bat starts it for you)
Needs: HUB_TOKEN     the hub password (hub-token.txt), the same as LOCAL_AI_TOKEN in Supabase
Optional:
  SUPABASE_URL  default https://aqwdncyihcbktbbuvvzd.supabase.co
  WHISPER_URL   default http://127.0.0.1:8080/inference   (whisper.cpp's whisper-server)
  LLM_URL       default http://127.0.0.1:1234/v1/chat/completions   (LM Studio)
  HUB_MODEL     the model to ask for (default: whichever model LM Studio has loaded)
Message text is never written to the screen or to a file.
"""
import json, os, re, sys, tempfile, threading, time, uuid, urllib.error, urllib.request

TOKEN = os.environ.get("HUB_TOKEN", "")
BASE = os.environ.get("SUPABASE_URL", "https://aqwdncyihcbktbbuvvzd.supabase.co").rstrip("/")
WHISPER = os.environ.get("WHISPER_URL", "http://127.0.0.1:8080/inference")
LLM = os.environ.get("LLM_URL", "http://127.0.0.1:1234/v1/chat/completions")
MODELS_URL = LLM.rsplit("/chat/completions", 1)[0] + "/models"
MODEL = os.environ.get("HUB_MODEL", "")
VERSION = "worker-2"
if len(TOKEN) < 24:
    sys.exit("Set HUB_TOKEN first (start-hub.bat reads it from hub-token.txt).")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def backend(fn, payload, timeout=60):
    req = urllib.request.Request(f"{BASE}/functions/v1/{fn}", data=json.dumps(payload).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def call_jobs(payload):
    return backend("call-jobs", payload)


def transcribe(path, filename):
    """Send the audio to whisper-server (multipart form). It converts any format with ffmpeg (--convert)."""
    boundary = uuid.uuid4().hex
    with open(path, "rb") as f:
        audio = f.read()
    parts = []
    for name, value in (("response_format", "verbose_json"), ("temperature", "0.0")):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + audio + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(WHISPER, data=b"".join(parts), method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=3600) as r:
        out = json.loads(r.read() or b"{}")
    text = (out.get("text") or " ".join(s.get("text", "") for s in out.get("segments", []))).strip()
    segs = out.get("segments") or []
    seconds = int(float(segs[-1].get("end", 0))) if segs else None
    return re.sub(r"\s+\n", "\n", text), seconds


SUMMARY_PROMPT = """You write call notes for Re-Charge, a small AI and automation studio in Johannesburg, from a call transcript. The transcript may have mistakes; don't invent anything that wasn't said.

Answer with ONE JSON object and nothing else:
{"summary": "...", "wants": "...", "decisions": ["..."], "actions": ["..."], "next_step": "...", "prices": ["..."], "follow_up": "..."}

- summary: 2-4 plain sentences on what the call was about.
- wants: what the other person wants, in one sentence ("" if unclear).
- decisions: what was agreed (empty list if nothing).
- actions: things Re-Charge must do, each starting with a verb (empty list if none).
- next_step: the single most important next step for Re-Charge.
- prices: any prices, budgets or amounts mentioned, as said (empty list if none).
- follow_up: a date or time mentioned for the next contact, as said ("" if none)."""


def summarise(transcript, job):
    lead = job.get("lead") or {}
    context = f"Lead: {lead.get('ref', '')} {lead.get('business') or lead.get('name') or ''}\nWhat they first asked for: {lead.get('goal', '')}\n\n" if lead else ""
    body = {"model": "local", "temperature": 0.2, "max_tokens": 700, "stream": False,
            "messages": [{"role": "system", "content": SUMMARY_PROMPT},
                         {"role": "user", "content": context + "Transcript:\n" + transcript[:18000]}]}
    req = urllib.request.Request(LLM, data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        text = json.loads(r.read())["choices"][0]["message"]["content"]
    text = re.sub(r"```(?:json)?", "", text)
    s = json.loads(text[text.index("{"): text.rindex("}") + 1])
    lst = lambda v: [str(x).strip() for x in v if str(x).strip()][:8] if isinstance(v, list) else []
    return {"summary": str(s.get("summary", "")).strip(), "wants": str(s.get("wants", "")).strip(), "decisions": lst(s.get("decisions")),
            "actions": lst(s.get("actions")), "next_step": str(s.get("next_step", "")).strip(), "prices": lst(s.get("prices")),
            "follow_up": str(s.get("follow_up", "")).strip()}


def work(job):
    log(f"Call {job['id'][:8]}: downloading")
    suffix = os.path.splitext(job.get("filename") or "")[1] or ".audio"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        urllib.request.urlretrieve(job["audio_url"], path)
        log("  transcribing (this takes a while for a long call)")
        t0 = time.time()
        transcript, seconds = transcribe(path, os.path.basename(path))
        if len(transcript) < 5:
            raise RuntimeError("Whisper heard no speech in the recording")
        log(f"  transcribed {seconds or '?'}s of audio in {int(time.time() - t0)}s; writing the notes")
        try:
            summary = summarise(transcript, job)
        except Exception as e:  # keep the transcript even if the notes fail
            log("  notes failed:", e)
            summary = {"summary": "Transcribed. The notes couldn't be written automatically; read the transcript.", "actions": [], "decisions": [], "prices": [], "wants": "", "next_step": "", "follow_up": ""}
        call_jobs({"action": "done", "id": job["id"], "transcript": transcript, "summary": summary, "seconds": seconds})
        log("  done")
    finally:
        try:
            os.remove(path)  # the recording is not kept on this PC
        except OSError:
            pass


# ---------- 1. Website and panel answers ----------
_models = {"at": 0.0, "list": []}


def lm_models():
    """The models LM Studio has loaded, checked at most once a minute. Empty when it isn't answering."""
    if time.time() - _models["at"] < 60:
        return _models["list"]
    try:
        with urllib.request.urlopen(MODELS_URL, timeout=5) as r:
            _models["list"] = [m.get("id", "") for m in json.loads(r.read() or b"{}").get("data", [])][:8]
    except Exception:
        _models["list"] = []
    _models["at"] = time.time()
    return _models["list"]


def answer(job):
    """Ask LM Studio. Only the parts of the request the model needs are passed on."""
    b = job.get("body") or {}
    messages = [{"role": str(m.get("role", "user")), "content": str(m.get("content", ""))} for m in (b.get("messages") or [])][:40]
    req = {"model": MODEL or "local", "stream": False, "messages": messages,
           "max_tokens": max(16, min(int(b.get("max_tokens") or 500), 1500)),
           "temperature": max(0.0, min(float(b.get("temperature") or 0), 1.0))}
    # stop when the website stops waiting (expires_at), give or take a few seconds
    left = 45
    try:
        from datetime import datetime
        left = datetime.fromisoformat(str(job.get("expires_at", "")).replace("Z", "+00:00")).timestamp() - time.time()
    except Exception:
        pass
    r = urllib.request.Request(LLM, data=json.dumps(req).encode(), method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=max(5, min(left + 2, 120))) as res:
        return json.loads(res.read())["choices"][0]["message"]["content"]


def answers_loop(calls_waiting):
    log(f"Website answers: collecting from {BASE}")
    online = None
    while True:
        try:
            models = lm_models()
            ready = bool(models)
            if ready != online:
                log("LM Studio is answering: ready for the website" if ready else "LM Studio isn't answering yet (is its server on?). The website uses its prepared answers meanwhile.")
                online = ready
            got = backend("hub-jobs", {"action": "next", "ready": ready, "models": models, "version": VERSION, "wait": 20 if ready else 0}, timeout=40)
            if got.get("calls_waiting"):
                calls_waiting.set()
            job = got.get("job")
            if not job:
                if not ready:
                    _models["at"] = 0  # look again next time
                    time.sleep(10)
                continue
            t0 = time.time()
            try:
                text = answer(job)
                backend("hub-jobs", {"action": "done", "id": job["id"], "text": text})
                log(f"Answered {job.get('task', 'a job')} in {time.time() - t0:.1f}s")
            except Exception as e:
                _models["at"] = 0
                log(f"Couldn't answer {job.get('task', 'a job')}: {str(e)[:120]}")
                try:
                    backend("hub-jobs", {"action": "fail", "id": job["id"], "error": str(e)[:300]})
                except Exception:
                    pass
        except urllib.error.HTTPError as e:
            log("The website refused the hub password: check hub-token.txt matches LOCAL_AI_TOKEN" if e.code == 401 else f"The website said {e.code}" + (": deploy the hub-jobs function (hub/README.md)" if e.code == 404 else ""))
            time.sleep(30)
        except Exception as e:
            log("Couldn't reach the website:", str(e)[:120])
            time.sleep(5)


# ---------- 2. Call recordings ----------
def calls_loop(calls_waiting):
    """Checks for recordings when the website says one is waiting, and every 10 minutes anyway."""
    log("Call recordings: ready")
    while True:
        calls_waiting.wait(600)
        calls_waiting.clear()
        while True:
            try:
                job = call_jobs({"action": "next"}).get("job")
            except Exception as e:
                log("Couldn't reach the website for calls:", str(e)[:120])
                break
            if not job:
                break
            try:
                work(job)
            except Exception as e:
                log("  failed:", e)
                try:
                    call_jobs({"action": "fail", "id": job["id"], "error": str(e)[:300]})
                except Exception:
                    pass


if __name__ == "__main__":
    log("Re-Charge hub worker: the PC only calls out; nothing here is open to the internet")
    waiting = threading.Event()
    waiting.set()  # look for recordings once at the start
    threading.Thread(target=calls_loop, args=(waiting,), daemon=True).start()
    answers_loop(waiting)
