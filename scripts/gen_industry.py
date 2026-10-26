#!/usr/bin/env python3
"""Generate the industry landing pages (src/for-<slug>.body + .body.head).
Run:  python3 scripts/gen_industry.py && for p in for-accountants for-salons for-plumbers for-restaurants for-cleaners; do bash src/build.sh $p src/$p.body > $p.html; done
Edit the INDUSTRIES data below to change copy; keep facts consistent with pricing.html.
Accountants lead with the Inbox Assistant; the others lead with AI for WhatsApp and enquiries,
with the Inbox Assistant for busy email inboxes and a website as an add-on. Only promise what
the kit does today: there is no phone line or voice AI, so missed calls are followed up in writing."""
import html

SITE = "https://re-charge.co.za"
BOOK = "https://calendar.app.google/58FYamh1ahXB4khM9"

# Line icons (24 viewBox, stroke 2), one per problem card. A tick never marks a problem.
ICON = {
    "missed": '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/><path d="m16 2 6 6M22 2l-6 6"/>',
    "moon": '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    "alert": '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    "calx": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M10 14l4 4M14 14l-4 4"/>',
    "repeat": '<path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    "chat": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "doc": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
    "people": '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    "inbox": '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    "tag": '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
    "userx": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
}
def icon(k):
    return f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">{ICON[k]}</svg>'
CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>'
e = html.escape
Z = lambda n: f'<span data-zar="{n}">R{n:,}</span>'

# Price rows: (name, small line, price html). Shared rows first.
WA_ROW = ("WhatsApp and enquiry assistant",
          f"Replies drafted from your prices and diary, on WhatsApp and your website. Then from {Z(7500)}/mo to keep it running (3-month minimum, then month to month)",
          f'<small>from</small>{Z(25000)}')
IA_ROW = ("Lots of customer email (20+ a day)? Inbox Assistant",
          f"Routine email replies drafted for your team. {Z(9500)} setup + {Z(2950)}/mo, with a {Z(1500)} deposit to start, refunded in full if it doesn&rsquo;t save 5 hours a week",
          f'<small>setup</small>{Z(9500)}')
WEB_ROW = lambda what: ("Add a website", what, f'<small>from</small>{Z(12500)}')
TERMS = "40% deposit, the rest at go-live. It drafts replies to your real messages before it goes live, and you can stop after any stage."
WHO_FAQ = ("Who will we deal with?", "A small studio: the person on your free call builds it and answers your messages, with no call centre or hand-offs. It&rsquo;s documented and runs in accounts you own, so any developer can pick it up.")
LIGHT = "Only a few messages a day? We&rsquo;ll say so on the call. WhatsApp Business quick replies and an away message may be all you need, and they&rsquo;re free."

INDUSTRIES = [
  dict(slug="accountants", plural="practices", label="Accounting & professional firms", eyebrow="For accounting and professional firms",
       title="AI for Accounting Practices: Client Emails Drafted | Re-Charge",
       desc="Client emails drafted from your own deadlines, document lists and fees; your team checks and sends. R1,500 deposit, refunded if it doesn&rsquo;t save 5 hours a week.",
       h1="Your clients ask the same questions. Let AI draft the answers.",
       lead="&ldquo;Which documents do you need?&rdquo;, &ldquo;when is my return due?&rdquo;, &ldquo;how do I pay?&rdquo;: drafted in seconds from your own deadlines, document lists and fees, for your team to check and send. Busy season stops meaning new clients wait days.",
       hero_demo=("inbox-assistant#try", "Try it on a client email"),
       demo_img="assets/art/phone-accounts.webp?v=1", demo_w=600, demo_h=1005,
       demos=[("inbox-assistant#try", "Try it yourself", "A tax-return email, answered", "Use the sample client email: the deadline, the document list and the EFT question, drafted with gaps for what only you know.")],
       pains=[("inbox", "The same questions all day", "&ldquo;Which documents do you need?&rdquo;, &ldquo;when is it due?&rdquo;, &ldquo;did you get my IRP5?&rdquo;. Typed again between real work."),
              ("clock", "New clients wait in busy season", "A new enquiry sits under 60 status emails. By the time someone replies, they&rsquo;ve asked another practice."),
              ("doc", "Chasing documents by hand", "Reminders for missing certificates and statements, written one at a time.")],
       h2="AI drafts the reply. Your team stays in charge.",
       sets=["Client emails drafted from your deadlines, document lists and fees, in your firm&rsquo;s tone", "New-client enquiries answered in minutes, not when someone has time", "Anything that needs professional judgement marked for a person, never guessed", "Optional: missing-document reminders sent on a schedule", "Optional: answers for your staff from your own procedures and templates"],
       rows=[IA_ROW, ("Document chasing and reminders", "One automation: requests and reminders for missing documents, sent for you", f'<small>from</small>{Z(15000)}'),
             ("Answers from your own files", f"Staff ask in plain words and get the answer and where it came from. Then from {Z(7500)}/mo to keep it running", f'<small>from</small>{Z(25000)}')],
       steps=[("Free 30-minute call", "You tell us what comes in and what eats the day. We say honestly whether AI fits."),
              ("A R1,500 deposit", "Refunded in full if it doesn&rsquo;t save your team 5 hours a week. We time the work with you on day one."),
              ("Your page within 3 business days", "Loaded with your deadlines, document lists, fees and the way you like to reply."),
              ("Two weeks on real emails", "Your team marks how each reply went. Saving 5+ hours a week? Then the rest is due. If not, the deposit comes back.")],
       faq=[("Will it give tax or legal advice?", "No. It answers only from the deadlines, document lists and fees you give us, and anything that needs professional judgement is marked for a person to check before anything is sent."),
            ("Is client information safe?", "It&rsquo;s used only to draft your replies, under POPIA. Drafts are written by our own AI computer, in South Africa, so client emails don&rsquo;t go to any outside AI company and aren&rsquo;t used to train AI models; their brief stop on our server outside South Africa is protected the way POPIA requires. We don&rsquo;t keep the emails you paste, and you can sign our data processing agreement and a mutual NDA first."),
            ("We use a practice management system. Does it work with it?", "Yes, alongside it: your team pastes the email into your private page and copies the reply back. On Microsoft 365 the drafts can wait in your inbox instead."),
            WHO_FAQ],
       light="Fewer than 20 client emails a day? We&rsquo;ll tell you on the call that it probably isn&rsquo;t worth it yet, and suggest something simpler."),
  dict(slug="salons", plural="salons", label="Salons", eyebrow="For hair and beauty salons",
       title="AI for Salons: WhatsApp Bookings Answered | Re-Charge",
       desc="AI that answers your salon&rsquo;s WhatsApp and website enquiries in seconds, from your own prices and open slots, while you&rsquo;re with a client. A person stays in charge.",
       h1="Fill your chair, not your DMs.",
       lead="Every &ldquo;how much for a cut and colour?&rdquo; and &ldquo;any space Saturday?&rdquo; answered in seconds, from your own prices and open slots, while you&rsquo;re busy with a client.",
       hero_demo=("live-demo?sample=enquiries", "See it answer one"),
       demo_img="assets/art/phone-chat.webp?v=1", demo_w=600, demo_h=1005,
       demos=[("live-demo?sample=enquiries", "Live demo", "A Saturday booking, answered", "A client asks for gel nails on Saturday. The reply offers the open slots and the price, ready to send.")],
       pains=[("repeat", "The same questions all day", "Prices, hours, &ldquo;do you do&hellip;?&rdquo;. Most messages need the same few answers, typed again between clients."),
              ("chat", "Bookings lost while you work", "You can&rsquo;t reply mid-colour. By the time you can, they&rsquo;ve booked somewhere else."),
              ("calx", "No-shows and gaps", "Reminders and &ldquo;we have a gap at 2pm&rdquo; messages that never get sent because nobody has the time.")],
       h2="AI drafts the reply. You stay in charge.",
       sets=["Replies drafted from your price list, services and open slots", "Booking requests offered real times from your diary", "Anything unusual, a complaint or a big booking passed to you", "Reminders the day before, so fewer no-shows", "Optional: a simple website with prices, gallery and a Book button"],
       rows=[WA_ROW, IA_ROW, WEB_ROW("Prices, gallery, Book and WhatsApp buttons")],
       faq=[("Does it reply by itself?", "Only if you want it to. We start with drafts: the reply is written, you glance at it and press send. Routine answers can go out by themselves later, if you switch that on."),
            ("Will it get my prices wrong?", "It answers only from the price list and rules you give us. Anything it isn&rsquo;t sure about is left for you, never guessed."),
            ("Do I keep my WhatsApp number?", "Yes. It works on your existing WhatsApp Business number, and you can still read and reply on your phone as usual."),
            ("Do I still need a website?", f"Not to start. If you want one, a salon site with prices, gallery and booking is an add-on from {Z(12500)}."),
            WHO_FAQ]),
  dict(slug="plumbers", plural="plumbers", label="Plumbers & trades", eyebrow="For plumbers and trades",
       title="AI for Plumbers & Trades: No Missed Call Left Hanging | Re-Charge",
       desc="Missed calls and WhatsApps followed up in seconds for plumbers, electricians and aircon businesses: jobs offered a slot, emergencies sent to the on-call person.",
       h1="When the geyser bursts, be the one who answers.",
       lead="Missed calls, WhatsApps at 11pm and &ldquo;how much for a geyser?&rdquo;: followed up in seconds. Voicemails and WhatsApps turned into job cards, jobs offered a slot from your diary, and real emergencies sent straight to whoever is on call.",
       hero_demo=("live-demo?sample=calls", "See it follow one up"),
       demo_img="assets/art/phone-call.webp?v=2", demo_w=600, demo_h=1005,
       demos=[("live-demo?sample=calls", "Live demo", "A missed call, followed up", "A caller&rsquo;s geyser isn&rsquo;t heating. The voicemail becomes a job card, and a WhatsApp with a slot and the call-out price is ready to send.")],
       pains=[("missed", "Calls you can&rsquo;t take", "You&rsquo;re under a sink. The call goes to voicemail, and the customer calls the next plumber on Google."),
              ("moon", "Quotes typed at night", "Every &ldquo;how much for&hellip;?&rdquo; needs a reply with your call-out and rates, written after a full day on site."),
              ("alert", "Emergencies mixed in with admin", "A burst pipe at 6am sits in the same inbox as a newsletter. The urgent ones need to reach you first.")],
       h2="AI drafts the reply. You stay in charge.",
       sets=["Missed callers pointed to WhatsApp by your voicemail greeting, and answered there straight away", "Voicemails written up as job cards, where your phone line can send them by email", "Routine jobs offered a slot from your diary", "Emergencies sent to the on-call person straight away", "Quote replies drafted from your call-out fee and rates"],
       rows=[WA_ROW, IA_ROW, WEB_ROW("A fast site with tap-to-call and a quote tool")],
       faq=[("Does it talk to callers on the phone?", "No. It doesn&rsquo;t answer calls. You keep your number: your voicemail greeting and WhatsApp away message point callers to WhatsApp, where the assistant answers straight away. If your phone line can send voicemails by email, those become job cards too."),
            ("Does it reply by itself?", "Only where you choose. We start with drafts and job cards for the office to send. Routine bookings can go out by themselves later, if you switch that on."),
            ("What about real emergencies?", "Anything urgent, a burst pipe, a gas smell, no power, goes to the on-call person immediately, not into a queue."),
            ("What if it stops working at night?", "Your calls and WhatsApps still come straight to you, exactly as they do today, so nothing is lost. We fix it the next business morning, as part of the monthly plan."),
            WHO_FAQ]),
  dict(slug="restaurants", plural="restaurants", label="Restaurants", eyebrow="For restaurants",
       title="AI for Restaurants: Bookings and Questions Answered | Re-Charge",
       desc="AI that answers your restaurant&rsquo;s WhatsApps and messages: table bookings, &ldquo;are you open?&rdquo;, menu questions and functions, in seconds, from your own menu.",
       h1="Bookings answered, even in the Friday rush.",
       lead="&ldquo;Table for 6 at 7?&rdquo;, &ldquo;are you open on Monday?&rdquo;, &ldquo;do you have vegan options?&rdquo;: answered from your own menu and diary while the kitchen is flat out.",
       hero_demo=("live-demo?sample=restaurant", "See it answer one"),
       demo_img="assets/art/phone-restaurant.webp?v=2", demo_w=600, demo_h=1005,
       demos=[("live-demo?sample=restaurant", "Live demo", "A Friday of messages, answered", "Tables, kids&rsquo; menus, corkage and a function for 40: answered from the menu and booking rules, with the function and a complaint passed to the manager."),
              ("live-demo?sample=reviews", "Live demo", "Your weekend reviews, sorted by Monday", "Thank-yous drafted, an allergy complaint flagged, and slow Saturday service spotted as a pattern.")],
       pains=[("chat", "Calls and WhatsApps during service", "The phone rings at 19:30 and nobody can get to it. WhatsApps sit unread until close. Those bookings go to the place that answered."),
              ("repeat", "The same five questions", "Hours, parking, the menu, kids, vegan options. Typed again, every day."),
              ("userx", "Empty tables you&rsquo;d booked", "A table of 8 that doesn&rsquo;t show on Saturday is a table you turned away twice.")],
       h2="Answered mid-service. You stay in charge.",
       sets=["Replies from your menu, hours and booking rules; the safe ones you choose go out by themselves", "Normal table requests offered real times, even at 7pm on a Friday", "Functions and big tables flagged to the manager, with an instant holding reply so they don&rsquo;t book elsewhere", "A reminder the afternoon before (&ldquo;Reply YES to keep your table&rdquo;), so cancellations free up the table", "Facebook, Instagram and Google messages answered; reviews thanked and complaints flagged to the manager the same night", "Optional: a website with the full menu and WhatsApp ordering"],
       rows=[WA_ROW, IA_ROW, WEB_ROW("Your full menu, hours, map and WhatsApp ordering")],
       friday=True,
       faq=[("Can it take bookings properly?", "Yes: it offers times from your booking rules and passes anything unusual to a person. If you use Dineplan, ResDiary or a paper diary, it works alongside it: where it can&rsquo;t see your bookings, it holds the request and a person confirms."),
            ("Does it reply by itself, even mid-service?", "Only where you choose. It starts with drafts on your real messages so you can check it. Then the safe ones (hours, parking, the menu, a normal table inside your booking rules) can go out by themselves, day or night. Functions, big tables and complaints always wait for a person."),
            ("What if it gets a booking wrong?", "It never confirms a table it can&rsquo;t see as free. Anything it isn&rsquo;t sure of waits for a person."),
            ("I have two branches.", "One assistant can handle both and send each booking to the right branch. The quote covers both."),
            ("Do I keep my WhatsApp number?", "Yes. It works on your existing WhatsApp Business number, and staff can still read and reply on the phone."),
            ("Does it charge commission?", "No. It&rsquo;s a fixed price, not a cut of your orders or bookings."),
            WHO_FAQ]),
  dict(slug="cleaners", plural="cleaners", label="Cleaning services", eyebrow="For cleaning services",
       title="AI for Cleaning Services: Quotes and Bookings Answered | Re-Charge",
       desc="AI that answers your cleaning business&rsquo;s enquiries: &ldquo;how much for a 3-bedroom?&rdquo; quoted from your own rates, bookings offered, regulars rebooked.",
       h1="Quote in seconds. Book while you clean.",
       lead="Every &ldquo;how much for a 3-bedroom house?&rdquo; quoted from your own rates in seconds, bookings offered and regulars rebooked, while your team is out cleaning.",
       hero_demo=("live-demo?sample=cleaning", "See it answer one"),
       demo_img="assets/art/phone-clean.webp?v=1", demo_w=600, demo_h=1005,
       demos=[("live-demo?sample=cleaning", "Live demo", "A day of enquiries, quoted and booked", "Quotes from your rates per room and frequency, regulars rebooked, and a complaint passed straight to the owner.")],
       pains=[("tag", "Quotes take the evening", "Rooms, frequency, extras: every enquiry needs a price worked out and typed."),
              ("clock", "Leads go cold", "Reply the next morning and they&rsquo;ve already booked the company that answered first."),
              ("repeat", "Rebooking regulars", "Weekly and monthly clients need reminders and rebooking, done by hand.")],
       h2="AI drafts the reply. You stay in charge.",
       sets=["Quotes drafted from your rates per room, frequency and extras", "Bookings offered from your team&rsquo;s available days", "Regulars reminded and rebooked", "Complaints and special requests passed to you", "Optional: a website with an instant quote tool"],
       rows=[WA_ROW, IA_ROW, WEB_ROW("A site with an instant quote tool")],
       faq=[("Will the quote match my prices?", "Yes. It works only from the rates you give us, and anything unusual is left for you to price."),
            ("Can it handle repeat clients?", "Yes: reminders and rebooking for weekly and monthly clients, with changes passed to you."),
            ("Does it reply by itself?", "Only if you want it to. We start with drafts you send in one tap; routine answers can go out by themselves later."),
            ("Do I still need a website?", f"Not to start. A site with an instant quote tool is an add-on from {Z(12500)}."),
            WHO_FAQ]),
]

DEFAULT_STEPS = [("Free 30-minute call", "You tell us what comes in and what eats your day. We say honestly whether AI fits."),
                 ("Fixed quote", "Exactly what it will do and what it costs. Nothing starts until you&rsquo;ve said yes."),
                 ("Tested on real messages", "It drafts replies to your real enquiries first, so you see it working before it goes live."),
                 ("Running, and measured", "We look after it and send you the time it saved each month.")]

def text(h):  # for meta tags: entities stay escaped once
    return h

def head(ind):
    url = f"{SITE}/for-{ind['slug']}"
    return f"""<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{ind['title']}</title>
  <meta name="description" content="{ind['desc']}" />
  <link rel="canonical" href="{url}" />
  <meta name="theme-color" content="#f7f7f7" />

  <meta property="og:url" content="{url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Re-Charge" />
  <meta property="og:title" content="{ind['title']}" />
  <meta property="og:description" content="{ind['desc']}" />
  <meta property="og:image" content="{SITE}/og-image.png?v=7" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="en_ZA" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{ind['title']}" />
  <meta name="twitter:description" content="{ind['desc']}" />
  <meta name="twitter:image" content="{SITE}/og-image.png?v=7" />

  <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png?v=7" />
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png?v=7" />
  <link rel="manifest" href="site.webmanifest" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" media="print" onload="this.media=&#39;all&#39;" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" /></noscript>
  <link rel="stylesheet" href="styles.css?v=20261028e" />

  <script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@graph": [
    {{
      "@type": "BreadcrumbList",
      "itemListElement": [
        {{"@type": "ListItem", "position": 1, "name": "Home", "item": "{SITE}/"}},
        {{"@type": "ListItem", "position": 2, "name": "{e(html.unescape(ind['label']))}", "item": "{url}"}}
      ]
    }},
    {{"@type": "FAQPage", "mainEntity": []}}
  ]
}}
  </script>
</head>
<body>
"""

FRIDAY = """
          <div class="card card--tint reveal friday">
            <h3>The Friday test</h3>
            <p>This Friday at 19:30, ask a friend to WhatsApp you &ldquo;Table for 4 at 8?&rdquo; and time how long the reply takes. No tech needed.</p>
            <p class="small" style="margin-top:.6rem"><a class="inline-link" href="#" data-wa-text="Hi Re-Charge, I tried the Friday test. Our reply took this many minutes: " data-contact="whatsapp" data-track="friday-test-wa" hidden>Tell us how long it took</a></p>
          </div>"""

def body(ind):
    others = [o for o in INDUSTRIES if o["slug"] != ind["slug"]]
    pains = "".join(f"""
          <div class="card reveal"><span class="card__icon" aria-hidden="true">{icon(k)}</span><h3>{t}</h3><p>{d}</p></div>""" for k, t, d in ind["pains"])
    sets = "".join(f"\n            <li>{CHECK} <span>{b}</span></li>" for b in ind["sets"])
    faq = "".join(f"""
          <details class="faq__item"><summary>{q}</summary><p>{a}</p></details>""" for q, a in ind["faq"])
    rows = "".join(f"""
            <li><div class="pl-name">{n}<small>{w}</small></div><span class="price">{p}</span></li>""" for n, w, p in ind["rows"])
    steps = "".join(f"""
          <li class="step"><span class="step__num">{i}</span><h3>{t}</h3><p>{d}</p></li>""" for i, (t, d) in enumerate(ind.get("steps", DEFAULT_STEPS), 1))
    demos = "".join(f"""
          <a class="card card--link work-card reveal" href="{h}">
            <div class="work-card__body">
              <div class="work-card__meta"><span class="badge badge--concept">{e(b)}</span><span class="tag tag--muted">Sample work, nothing is sent</span></div>
              <h3>{t}</h3>
              <p>{d}</p>
              <div class="card__foot"><span class="card__more">{'Try it' if h.startswith('inbox') else 'Run it yourself'}</span></div>
            </div>
          </a>""" for h, b, t, d in ind["demos"])
    other_links = " · ".join(f'<a class="inline-link" href="for-{o["slug"]}">{o["label"]}</a>' for o in others)
    hd = ind["hero_demo"]
    return f"""
  <main id="main">

    <section class="page-head industry-head page-head--art">
      <div class="container">
        <span class="eyebrow">{ind['eyebrow']}</span>
        <h1>{ind['h1']}</h1>
        <figure class="ph-art ph-art--phone" aria-hidden="true"><img src="{ind['demo_img']}" alt="" width="{ind['demo_w']}" height="{ind['demo_h']}" /></figure>
        <p class="lead">{ind['lead']}</p>
        <div class="btn-row" style="margin-top:1.4rem">
          <a class="btn btn--primary btn--large" href="{BOOK}" target="_blank" rel="noopener" data-track="cta-{ind['slug']}-book">Book a free 30-minute call</a>
          <a href="{hd[0]}" class="btn btn--ghost btn--large" data-track="cta-{ind['slug']}-demo">{hd[1]}</a>
        </div>
        <p class="small muted" data-contact-block hidden>Rather message? <a class="inline-link" href="#" data-contact="whatsapp" hidden>WhatsApp us</a></p>
      </div>
    </section>

    <section class="section" aria-labelledby="painTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">Where the day goes</span><h2 id="painTitle">The messages that eat your day.</h2></div>
        <div class="grid grid--3">{pains}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="setTitle">
      <div class="container service__grid">
        <div class="reveal">
          <span class="eyebrow">What we&rsquo;d set up</span>
          <h2 id="setTitle">{ind['h2']}</h2>
          <ul class="tick-list">{sets}
          </ul>
          <p class="small muted" style="margin-top:1rem">It answers only from your own prices and rules. Anything it isn&rsquo;t sure about goes to a person.</p>
        </div>
        <div class="industry-demos">{demos}
        </div>
      </div>
    </section>

    <section class="section" id="pricing" aria-labelledby="priceTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">What it costs</span><h2 id="priceTitle">A fixed price before anything starts.</h2></div>
        <div class="grid grid--2 industry-pricing">
          <div class="reveal">
            <ul class="price-list">{rows}
            </ul>
            <p class="small muted" style="margin-top:.8rem">{TERMS if ind['slug'] != 'accountants' else 'A fixed quote before anything starts, and you can stop after any stage. No VAT is added: we&rsquo;re not VAT-registered.'}</p>
          </div>
          <div class="industry-side">
          <div class="card card--tint reveal">
            <h3>Not sure it&rsquo;s worth it?</h3>
            <p>That&rsquo;s what the free call is for. Tell us roughly how many messages and calls you get. We&rsquo;ll tell you honestly whether AI would save real hours, and if not, we&rsquo;ll say so.</p>
            <p style="margin-top:.6rem">{ind.get('light', LIGHT)}</p>
            <p class="small muted" style="margin-top:0.8rem">Prices are starting points for typical {e(ind['plural'])}. Your quote is fixed before we begin. <a class="inline-link" href="pricing">Full price list &rarr;</a></p>
          </div>{FRIDAY if ind.get('friday') else ''}
          </div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="howTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">How it works</span><h2 id="howTitle">{'From first call to drafted replies.' if ind['slug'] == 'accountants' else 'From first call to answered messages.'}</h2></div>
        <ol class="steps steps--4 reveal">{steps}
        </ol>
      </div>
    </section>

    <section class="section" aria-labelledby="faqTitle">
      <div class="container container--narrow">
        <div class="section__head reveal"><span class="eyebrow">Questions {e(ind['plural'])} ask</span><h2 id="faqTitle">Straight answers.</h2></div>
        <div class="faq reveal">{faq}
        </div>
        <p class="small muted" style="margin-top:1.2rem">More in the <a class="inline-link" href="pricing#faq">general FAQ</a>. Also for: {other_links}.</p>
      </div>
    </section>

    <section class="cta" aria-labelledby="ctaTitle">
      <div class="container cta__inner reveal">
        <span class="cta__services">{ind['eyebrow']}</span>
        <h2 id="ctaTitle">{'Find out what Friday night is costing you.' if ind.get('friday') else 'Tell us what takes too long.'}</h2>
        <p>{'A free 30-minute call, phone or video, at a time that isn&rsquo;t service. You leave with a rough price, or an honest &ldquo;not worth it&rdquo;.' if ind.get('friday') else 'A free 30-minute call on Google Meet, or we phone you. You leave with a rough price, or an honest &ldquo;not worth it&rdquo;.'}</p>
        <div class="btn-row btn-row--center">
          <a class="btn btn--light btn--large" href="{BOOK}" target="_blank" rel="noopener" data-track="cta-{ind['slug']}-book-end">Book a free 30-minute call</a>
        </div>
        <p class="cta__alt">Rather we phone you? <button type="button" class="inline-link" data-call-open>Pick a time</button> &middot; Prefer to write? <button type="button" class="inline-link" data-review-open>Tell us in two lines</button></p>
        <p class="small muted" data-contact-block hidden>Rather message? <a class="inline-link" href="#" data-contact="whatsapp" hidden>WhatsApp us</a></p>
      </div>
    </section>

  </main>
"""

for ind in INDUSTRIES:
    open(f"src/for-{ind['slug']}.body.head", "w").write(head(ind))
    open(f"src/for-{ind['slug']}.body", "w").write(body(ind))
print("generated", ", ".join(f"for-{i['slug']}" for i in INDUSTRIES))
