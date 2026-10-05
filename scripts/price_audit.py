# -*- coding: utf-8 -*-
import re, glob, html, sys
# What each Re-Charge price must be. Anything on the site quoting a different
# figure for the same thing is a contradiction a prospect can find.
EXPECT = {
 "AI assistant (entry)":  "R5,900",
 "AI assistant (full)":   "R11,500",
 "Automation/dashboard":  "R7,500",
 "Custom software":       "R17,500",
 "Quick website":         "R1,000",
 "Business website":      "R2,000",
 "Custom website":        "R4,500",
 "Google profile":        "R450",
 "Hosting":               "R50",
 "Care":                  "R150",
 "AI Care":               "R550",
 "Retainer":              "R6,500",
 "Pay monthly":           "R249",
}
# Figures that are no longer anybody's price. Finding one means a page is stale.
BANNED = ["R3,500", "R11,500 to build", "R22,500", "R14,500", "R35,000 to", "R20,000",
          "R9,500", "R8,500", "R795", "R9,540", "R1,200,", "R180/month", "R180 a month",
          "R450/month", "R450 a month", "R850", "R500 deposit", "R1,000 off"]
bad = 0
for f in sorted(glob.glob("*.html")):
    text = html.unescape(re.sub(r"<[^>]*>", " ", open(f, encoding="utf-8").read()))
    # Fictional businesses in the demos quote their own prices; those are not ours.
    for frag in ["Deep clean", "Toilet replacement", "Geyser replacement", "Standard home clean",
                 "Tap / mixer repair", "Carpet", "Office cleaning", "Leak detection", "Blocked drains"]:
        text = re.sub(re.escape(frag) + r"[^.]{0,40}", " ", text)
    for b in BANNED:
        if b in text:
            print(f"STALE  {f}: {b!r}")
            bad += 1
print("PRICE AUDIT:", "CLEAN" if not bad else f"{bad} stale figure(s)")
sys.exit(1 if bad else 0)
