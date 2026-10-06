"""Rewrite a page head's title, description, canonical/og URL and JSON-LD.
Usage (from Python): set_head(src_head, out_head, slug, title, desc, ld_list)
Keeps everything else (fonts, icons, stylesheet) from the source head."""
import json, re, html

def set_head(src, out, slug, title, desc, ld):
    s = open(src).read()
    url = "https://re-charge.co.za/" + slug
    t = html.escape(title, quote=True).replace("&#x27;", "&#39;")
    d = html.escape(desc, quote=True).replace("&#x27;", "&#39;")
    s = re.sub(r"<title>.*?</title>", "<title>" + t + "</title>", s)
    s = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + d + m.group(2), s)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), s)
    s = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), s)
    for k in ('property="og:title"', 'name="twitter:title"'):
        s = re.sub(r'(<meta ' + re.escape(k) + r' content=")[^"]*(")', lambda m: m.group(1) + t + m.group(2), s)
    for k in ('property="og:description"', 'name="twitter:description"'):
        s = re.sub(r'(<meta ' + re.escape(k) + r' content=")[^"]*(")', lambda m: m.group(1) + d + m.group(2), s)
    s = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', "", s, flags=re.S)
    blocks = "".join('\n  <script type="application/ld+json">\n' + json.dumps(x, indent=2, ensure_ascii=False) + "\n  </script>" for x in ld)
    s = s.replace("</head>", blocks + "\n</head>", 1)
    open(out, "w").write(s)

def crumbs(name, slug):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://re-charge.co.za/"},
        {"@type": "ListItem", "position": 2, "name": name, "item": "https://re-charge.co.za/" + slug}]}

def faq(pairs):
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs]}
