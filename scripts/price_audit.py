# -*- coding: utf-8 -*-
import re, glob, html, sys
# What each Re-Charge price must be. Anything on the site quoting a different
# figure for the same thing is a contradiction a prospect can find.
EXPECT = {
 "Inbox Assistant setup": "R9,500",
 "Inbox Assistant":       "R2,950",
 "Discovery":             "R15,000",
 "Proof of concept":      "R35,000",
 "Production":            "R85,000",
 "Operate":               "R7,500",
 "Optimise":              "R15,000",
 "Partner (operations)":  "R35,000",
 "Change requests":       "R1,250",
 "Consulting":            "R1,850",
 "Emergency support":     "R2,450",
 "Dashboard":             "R15,000",
 "Automation":            "R15,000",
 "AI solution":           "R25,000",
 "Custom software":       "R45,000",
 "Business website":      "R12,500",
 "Platform / web app":    "R35,000",
 "Managed hosting":       "R450/month",
 "Care":                  "R1,450/month",
}
# Figures that are no longer anybody's price. Finding one means a page is stale.
# (2026-10-11: no small-business tier, so the old R1,000-R4,500 entry prices are all gone.
#  2026-10-14: R9,500 is back, as the Inbox Assistant setup.)
BANNED = ["from R1,000", "R1,000 for", "R1,000)", "from R2,000", "from R3,500", "from R4,500", "around R2,000", "about R1,000",
          "R249", "R150/month", "R150 a month", "R50/month", "R50 a month", "R1,500/yr", "R18,500", "R850/hour", "R1,650",
          "R7,500 discovery", "discovery (R7,500)", "Google profile setup", "Pay monthly", "pay-monthly website",
          "R5,900", "R11,500", "R22,500", "R8,500", "R795", "R9,540", "R180/month", "R180 a month", "R500 deposit", "R1,000 off", "R300/mo",
          "AI Care, first year"]
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
