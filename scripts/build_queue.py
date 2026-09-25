#!/usr/bin/env python3
"""Talk to the build-queue Edge Function (automatic mockup builder).

  python3 scripts/build_queue.py fetch                      # prints queued briefs as JSON
  python3 scripts/build_queue.py report --project <uuid> --status built|failed \
        [--url URL] [--commit SHA] [--files a,b] [--bytes N] [--notes "..."]

Needs env BUILD_SECRET (and optionally SUPABASE_FN_BASE).
"""
import argparse, json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("SUPABASE_FN_BASE", "https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1")
SECRET = os.environ.get("BUILD_SECRET", "")

def call(method, body=None):
    if not SECRET:
        sys.exit("BUILD_SECRET is not set in this environment")
    req = urllib.request.Request(f"{BASE}/build-queue", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"x-build-secret": SECRET, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"build-queue {method} failed: HTTP {e.code} {e.read().decode()[:300]}")
    except urllib.error.URLError as e:
        sys.exit(f"build-queue unreachable ({e.reason}). Is *.supabase.co allowed in this environment's network settings?")

ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
sub.add_parser("fetch")
r = sub.add_parser("report")
r.add_argument("--project", required=True); r.add_argument("--status", choices=["built", "failed"], required=True)
r.add_argument("--url"); r.add_argument("--commit"); r.add_argument("--files", default=""); r.add_argument("--bytes", type=int, default=0); r.add_argument("--notes", default="")
a = ap.parse_args()
if a.cmd == "fetch":
    print(json.dumps(call("GET"), indent=2))
else:
    print(json.dumps(call("POST", {"projectId": a.project, "status": a.status, "url": a.url, "commit": a.commit,
                                   "files": [f for f in a.files.split(",") if f], "bytes": a.bytes, "notes": a.notes})))
