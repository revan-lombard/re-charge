#!/usr/bin/env python3
"""Build 404.html from the shared header and footer (src/header.html, src/footer.html).
GitHub Pages serves 404.html at any bad path depth, so every relative link and asset
becomes root-absolute here. Run after changing the header or footer:  python3 scripts/build_404.py"""
import re

def absolute(h):
    h = re.sub(r"\{\{CUR_[^}]+\}\}", "", h)
    def fix(m):
        attr, url = m.group(1), m.group(2)
        if re.match(r"^(https?:|mailto:|tel:|#|/|data:|javascript:)", url) or url == "":
            return m.group(0)
        return f'{attr}="/{url}"'
    return re.sub(r'\b(href|src)="([^"]*)"', fix, h)

head = open("src/pricing.body.head").read()
css = re.search(r'<link rel="stylesheet" href="styles\.css\?v=[^"]+" />', head).group(0).replace('href="styles', 'href="/styles')
fonts = "\n".join(l for l in head.splitlines() if "fonts.googleapis.com/css2" in l)
page = f"""<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page not found | Re-Charge</title>
  <meta name="robots" content="noindex" />
  <meta name="theme-color" content="#f7f7f7" />
  <!-- Built by scripts/build_404.py: root-absolute paths, because this page is served at any bad path depth. -->
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png?v=7" />
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png?v=7" />
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
{fonts.replace("this.media='all'", "this.media='all'")}
  {css}
</head>
<body>
{absolute(open("src/header.html").read())}
  <main class="notfound" id="main">
    <span class="eyebrow">404</span>
    <h1>That page doesn&rsquo;t exist. We can build it.</h1>
    <p>The link may be old or mistyped. Here&rsquo;s the way back.</p>
    <div class="btn-row">
      <a href="https://calendar.app.google/58FYamh1ahXB4khM9" class="btn btn--primary btn--large" target="_blank" rel="noopener" data-track="cta-404-book">Book a free 30-minute call</a>
      <a href="/inbox-assistant" class="btn btn--ghost btn--large">See the Inbox Assistant</a>
      <a href="/" class="btn btn--ghost btn--large">Back to the homepage</a>
    </div>
  </main>
{absolute(open("src/footer.html").read())}"""
open("404.html", "w").write(page)
print("wrote 404.html")
