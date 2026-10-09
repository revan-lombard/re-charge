# -*- coding: utf-8 -*-
import re, glob, html, sys
# What each Re-Charge price must be. Anything on the site quoting a different
# figure for the same thing is a contradiction a prospect can find.
EXPECT = {
 "Discovery":             "R7,500",
 "Proof of concept":      "R18,500",
 "Production":            "R45,000",
 "Operate":               "R4,500",
 "Optimise":              "R9,500",
 "Partner (operations)":  "R18,500",
 "Change requests":       "R850",
 "Consulting":            "R1,250",
 "Emergency support":     "R1,650",
 "Dashboard":             "R2,000",
 "Automation":            "R2,000",
 "AI solution":           "R3,500",
 "Custom software":       "R4,500",
 "Quick website":         "R1,000",
 "Business website":      "R2,000",
 "Custom website":        "R4,500",
 "Google profile":        "R450",
 "Hosting":               "R50",
 "Care":                  "R150",
 "Pay monthly":           "R249",
}
# Figures that are no longer anybody's price. Finding one means a page is stale.
# (R550 and R6,500 survive only as the legacy AI Care / retainer note, so they aren't banned.)
BANNED = ["R5,900", "Dashboards from R7,500", "dashboards from R7,500", "Custom software from R17,500", "Custom Software · from R17,500", "discovery R7,500, then", "R11,500", "R22,500", "R14,500", "R35,000 to", "R20,000",
          "R8,500", "R795", "R9,540", "R1,200,", "R180/month", "R180 a month",
          "R450/month", "R450 a month", "R500 deposit", "R1,000 off", "R300/mo",
          "AI Care, first year", "From R2,000 for dashboards"]
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
