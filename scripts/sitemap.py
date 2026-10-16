#!/usr/bin/env python3
"""Write sitemap.xml: every public, indexable page, with lastmod from git (today if the page
has changes not yet committed). Run before committing:  python3 scripts/sitemap.py"""
import datetime, subprocess

PAGES = ["", "inbox-assistant", "ai-for-business", "method", "ai-demos", "pricing", "start", "services", "demos",
         "for-accountants", "for-salons", "for-plumbers", "for-restaurants", "for-cleaners", "terms", "privacy"]
today = datetime.date.today().isoformat()
def lastmod(page):
    f = (page or "index") + ".html"
    dirty = subprocess.run(["git", "status", "--porcelain", "--", f], capture_output=True, text=True).stdout.strip()
    if dirty: return today
    d = subprocess.run(["git", "log", "-1", "--format=%cs", "--", f], capture_output=True, text=True).stdout.strip()
    return d or today
rows = "\n".join(f"  <url><loc>https://re-charge.co.za/{p}</loc><lastmod>{lastmod(p)}</lastmod></url>" for p in PAGES)
open("sitemap.xml", "w").write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{rows}\n</urlset>\n')
print("sitemap.xml:", len(PAGES), "pages")
