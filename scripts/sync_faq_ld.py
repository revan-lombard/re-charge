#!/usr/bin/env python3
"""Keep each page's FAQPage structured data (JSON-LD in src/<page>.body.head) word for word
the same as the FAQ visitors see (<details class="faq__item"> in src/<page>.body).
A page whose body has no FAQ loses its FAQPage block. Run after editing any FAQ, before build.sh:
    python3 scripts/sync_faq_ld.py"""
import glob, html, json, re

def text(h):
    h = re.sub(r"</li>\s*<li[^>]*>", "; ", h)
    h = re.sub(r"<[^>]+>", "", h)
    return re.sub(r"\s+", " ", html.unescape(h)).strip()

def faqs(body):
    out = []
    for m in re.finditer(r'<details class="faq__item"[^>]*>\s*<summary>(.*?)</summary>(.*?)</details>', body, re.S):
        q, a = text(m.group(1)), text(m.group(2))
        if q and a: out.append({"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}})
    return out

BLOCK = re.compile(r'(\s*<script type="application/ld\+json">\s*)(.*?)(\s*</script>)', re.S)
for head_path in sorted(glob.glob("src/*.body.head")):
    body_path = head_path[:-5]
    try: body = open(body_path).read()
    except FileNotFoundError: continue
    items, head, changed = faqs(body), open(head_path).read(), False
    def fix(m):
        global changed
        try: data = json.loads(m.group(2))
        except ValueError: return m.group(0)
        if data.get("@type") == "FAQPage":
            if not items: changed = True; return ""
            data["mainEntity"] = items; changed = True
        elif isinstance(data.get("@graph"), list):
            g = [x for x in data["@graph"] if x.get("@type") != "FAQPage" or items]
            for x in g:
                if x.get("@type") == "FAQPage": x["mainEntity"] = items
            data["@graph"] = g; changed = True
        else: return m.group(0)
        return m.group(1) + json.dumps(data, ensure_ascii=False, indent=2) + m.group(3)
    new = BLOCK.sub(fix, head)
    if changed and new != head:
        open(head_path, "w").write(new); print("synced", head_path, len(items), "questions")
