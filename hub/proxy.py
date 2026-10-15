#!/usr/bin/env python3
"""Re-Charge AI hub gateway: lets the website's backend use the AI model on this PC, safely.

It sits in front of LM Studio (or Ollama) and only lets through requests that carry the hub
password, and only to the two things the backend needs: the list of models and chat answers.
Everything else is refused. Standard library only: no installs needed beyond Python 3.

Run:   python proxy.py
Needs: HUB_TOKEN   the password (the same value as LOCAL_AI_TOKEN in Supabase)
Optional:
  HUB_UPSTREAM  where the model server is   (default http://127.0.0.1:1234, LM Studio's server;
                                             Ollama is http://127.0.0.1:11434)
  HUB_MODEL     the model to use, overriding what the backend asks for (default: leave as asked;
                LM Studio answers with whichever model is loaded)
  HUB_PORT      the port this gateway listens on (default 8787)
"""
import hmac, json, os, sys, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("HUB_TOKEN", "")
UPSTREAM = os.environ.get("HUB_UPSTREAM", "http://127.0.0.1:1234").rstrip("/")
MODEL = os.environ.get("HUB_MODEL", "")
PORT = int(os.environ.get("HUB_PORT", "8787"))
ALLOWED = {("GET", "/v1/models"), ("POST", "/v1/chat/completions")}
MAX_BODY = 200_000

if len(TOKEN) < 24:
    sys.exit("Set HUB_TOKEN to a long random password first (at least 24 characters). See README.md.")


class Gateway(BaseHTTPRequestHandler):
    server_version = "RechargeHub/1"

    def _reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle(self, method):
        path = self.path.split("?")[0]
        if (method, path) == ("GET", "/health"):
            return self._reply(200, {"ok": True})
        got = self.headers.get("Authorization", "")
        if not hmac.compare_digest(got.encode(), f"Bearer {TOKEN}".encode()):
            return self._reply(401, {"error": "wrong or missing hub password"})
        if (method, path) not in ALLOWED:
            return self._reply(404, {"error": "not available"})
        data = None
        if method == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return self._reply(413, {"error": "message too long"})
            try:
                req = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                return self._reply(400, {"error": "bad JSON"})
            req["stream"] = False
            if MODEL:
                req["model"] = MODEL
            data = json.dumps(req).encode()
        t0 = time.time()
        try:
            r = urllib.request.urlopen(urllib.request.Request(UPSTREAM + path, data=data, method=method,
                                                              headers={"Content-Type": "application/json"}), timeout=120)
            body = r.read()
            self.send_response(r.status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print(f"{time.strftime('%H:%M:%S')} {method} {path} {r.status} {int((time.time() - t0) * 1000)}ms", flush=True)
        except urllib.error.HTTPError as e:
            self._reply(e.code, {"error": f"model server said {e.code}"})
        except Exception as e:  # model server not running, timed out, …
            self._reply(502, {"error": f"model server not answering: {e}"})

    def do_GET(self): self._handle("GET")
    def do_POST(self): self._handle("POST")
    def log_message(self, *a): pass  # quiet; the line above logs what matters (never message text)


if __name__ == "__main__":
    print(f"Re-Charge AI hub gateway on http://127.0.0.1:{PORT}  →  {UPSTREAM}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Gateway).serve_forever()
