#!/usr/bin/env python3
"""Re-Charge call worker: transcribes and summarises call recordings on this PC.

Every 20 seconds it asks the website's backend (the call-jobs function) whether a recording is
waiting. If one is, it downloads it, transcribes it with the local Whisper server, has the local
model (LM Studio) write the call notes, and sends both back. The recording never leaves this PC
for an outside AI, and the PC only ever makes outgoing connections.

Run:   python worker.py        (start-hub.bat starts it for you)
Needs: HUB_TOKEN     the hub password (hub-token.txt), the same as LOCAL_AI_TOKEN in Supabase
Optional:
  SUPABASE_URL  default https://aqwdncyihcbktbbuvvzd.supabase.co
  WHISPER_URL   default http://127.0.0.1:8080/inference   (whisper.cpp's whisper-server)
  LLM_URL       default http://127.0.0.1:1234/v1/chat/completions   (LM Studio)
"""
import json, os, re, sys, tempfile, time, uuid, urllib.request

TOKEN = os.environ.get("HUB_TOKEN", "")
BASE = os.environ.get("SUPABASE_URL", "https://aqwdncyihcbktbbuvvzd.supabase.co").rstrip("/")
WHISPER = os.environ.get("WHISPER_URL", "http://127.0.0.1:8080/inference")
LLM = os.environ.get("LLM_URL", "http://127.0.0.1:1234/v1/chat/completions")
if len(TOKEN) < 24:
    sys.exit("Set HUB_TOKEN first (start-hub.bat reads it from hub-token.txt).")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def call_jobs(payload):
    req = urllib.request.Request(f"{BASE}/functions/v1/call-jobs", data=json.dumps(payload).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


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


if __name__ == "__main__":
    log(f"Re-Charge call worker: checking {BASE} every 20 seconds")
    while True:
        try:
            job = call_jobs({"action": "next"}).get("job")
            if job:
                try:
                    work(job)
                except Exception as e:
                    log("  failed:", e)
                    try:
                        call_jobs({"action": "fail", "id": job["id"], "error": str(e)[:300]})
                    except Exception:
                        pass
                continue
        except Exception as e:
            log("Couldn't reach the website:", e)
        time.sleep(20)
