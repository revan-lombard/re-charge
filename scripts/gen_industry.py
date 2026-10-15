#!/usr/bin/env python3
"""Generate the industry landing pages (src/for-<slug>.body + .body.head).
Run:  python3 scripts/gen_industry.py && for p in for-salons for-plumbers for-restaurants for-cleaners; do bash src/build.sh $p src/$p.body > $p.html; done
Edit the INDUSTRIES data below to change copy; keep facts consistent with pricing.html.
These pages lead with AI for enquiries and calls; a website is an add-on."""
import html, json, datetime

SITE = "https://re-charge.co.za"
INDUSTRIES = [
  dict(slug="salons", noun="salon", plural="salons", label="Hair & beauty salons",
       title="AI for Salons: Every WhatsApp Booking Answered | Re-Charge",
       desc="AI that answers your salon's WhatsApp and website enquiries in seconds, from your own prices and open slots, while you're with a client. A person stays in charge.",
       h1="Fill your chair, not your DMs.",
       lead="Every \u201chow much for a cut and colour?\u201d and \u201cany space Saturday?\u201d answered in seconds, from your own prices and open slots, while you\u2019re busy with a client.",
       demo_kind="enquiries", demo_img="assets/art/phone-chat.webp?v=1", demo_w=600, demo_h=1005, demo_name="A Saturday booking, answered",
       demo_line="A client asks for gel nails on Saturday. The reply offers the open slots and the price, ready to send.",
       pains=[("The same questions all day", "Prices, hours, \u201cdo you do\u2026?\u201d. Most messages need the same few answers, typed again between clients."),
              ("Bookings lost while you work", "You can\u2019t reply mid-colour. By the time you can, they\u2019ve booked somewhere else."),
              ("No-shows and gaps", "Reminders and \u201cwe have a gap at 2pm\u201d messages that never get sent because nobody has the time.")],
       sets=["Replies drafted from your price list, services and open slots", "Booking requests offered real times from your diary", "Anything unusual, a complaint or a big booking passed to you", "Reminders the day before, so fewer no-shows", "Optional: a simple website with prices, gallery and a Book button"],
       faq=[("Does it reply by itself?", "Only if you want it to. Most salons start with drafts: the reply is written, you glance at it and press send. Routine answers can go out by themselves later."),
            ("Will it get my prices wrong?", "It answers only from the price list and rules you give us. Anything it isn\u2019t sure about is left for you, never guessed."),
            ("Do I still need a website?", "Not to start. If you want one, a salon site with prices, gallery and booking is an add-on from R12,500.")]),
  dict(slug="plumbers", noun="plumbing business", plural="plumbers", label="Plumbers & trades",
       title="AI for Plumbers & Trades: Every Call and Message Answered | Re-Charge",
       desc="AI that answers missed calls and WhatsApps for plumbers, electricians and aircon businesses: jobs booked, emergencies sent to the on-call person, quotes drafted.",
       h1="When the geyser bursts, be the one who answers.",
       lead="Missed calls, WhatsApps at 11pm and \u201chow much for a geyser?\u201d: answered in seconds, jobs booked into your diary, and real emergencies sent straight to whoever is on call.",
       demo_kind="calls", demo_img="assets/art/phone-call.webp?v=1", demo_w=600, demo_h=1005, demo_name="A missed call, turned into a booked job",
       demo_line="A caller\u2019s geyser isn\u2019t heating. The job card is filled in, a slot booked and an SMS ready for the customer.",
       pains=[("Calls you can\u2019t take", "You\u2019re under a sink. The call goes to voicemail, and the customer calls the next plumber on Google."),
              ("Quotes typed at night", "Every \u201chow much for\u2026?\u201d needs a reply with your call-out and rates, written after a full day on site."),
              ("Emergencies mixed in with admin", "A burst pipe at 6am sits in the same inbox as a newsletter. The urgent ones need to reach you first.")],
       sets=["Missed calls and WhatsApps answered, with a job card filled in", "Routine jobs offered a slot from your diary, with an SMS to confirm", "Emergencies sent to the on-call person straight away", "Quote replies drafted from your call-out fee and rates", "Optional: a fast website with tap-to-call and a quote tool"],
       faq=[("Does it talk to my customers by itself?", "Only where you choose. Many trades start with drafts and job cards for the office to send; routine bookings can go out automatically later."),
            ("What about real emergencies?", "Anything urgent, a burst pipe, a gas smell, no power, goes to the on-call person immediately, not into a queue."),
            ("I get my work from word of mouth. Do I need this?", "Word of mouth still ends in a call or a WhatsApp. This makes sure that call gets answered, even when you can\u2019t.")]),
  dict(slug="restaurants", noun="restaurant", plural="restaurants", label="Restaurants & takeaways",
       title="AI for Restaurants: Bookings and Orders Answered | Re-Charge",
       desc="AI that answers your restaurant's WhatsApps and messages: table bookings, \u201care you open?\u201d, menu questions and event enquiries, in seconds, from your own menu.",
       h1="Bookings answered, even in the Friday rush.",
       lead="\u201cTable for 6 at 7?\u201d, \u201care you open on Monday?\u201d, \u201cdo you have vegan options?\u201d: answered from your own menu and diary while the kitchen is flat out.",
       demo_kind="enquiries", demo_img="assets/art/phone-restaurant.webp?v=1", demo_w=600, demo_h=1005, demo_name="A booking question, answered in seconds",
       demo_line="A customer asks for a time. The reply offers open slots, ready for you to send.",
       pains=[("Messages during service", "Nobody can answer WhatsApp at 7pm on a Friday. Those bookings go to the place that replied."),
              ("The same five questions", "Hours, parking, the menu, kids, vegan options. Typed again, every day."),
              ("Events and big tables slip", "A function enquiry is worth more than a week of walk-ins, and it waits under 40 other messages.")],
       sets=["Replies drafted from your menu, hours and booking rules", "Table requests offered real times", "Functions and large bookings flagged to the manager", "Reviews answered and complaints caught early", "Optional: a website with the full menu and WhatsApp ordering"],
       faq=[("Can it take bookings properly?", "Yes: it offers times from your booking rules and passes anything unusual to a person. If you already use a booking system, we work alongside it."),
            ("Does it charge commission?", "No. It\u2019s a fixed price, not a cut of your orders or bookings."),
            ("Do I still need a website?", "Not to start. A restaurant site with your menu and WhatsApp ordering is an add-on from R12,500.")]),
  dict(slug="cleaners", noun="cleaning business", plural="cleaners", label="Cleaning services",
       title="AI for Cleaning Services: Quotes and Bookings Answered | Re-Charge",
       desc="AI that answers your cleaning business's enquiries: \u201chow much for a 3-bedroom?\u201d quoted from your own rates, bookings offered, regulars rebooked.",
       h1="Quote in seconds. Book while you clean.",
       lead="Every \u201chow much for a 3-bedroom house?\u201d quoted from your own rates in seconds, bookings offered and regulars rebooked, while your team is out cleaning.",
       demo_kind="enquiries", demo_img="assets/art/phone-clean.webp?v=1", demo_w=600, demo_h=1005, demo_name="An enquiry, answered with a price and a time",
       demo_line="A customer asks for a booking. The reply offers times and the price, ready to send.",
       pains=[("Quotes take the evening", "Rooms, frequency, extras: every enquiry needs a price worked out and typed."),
              ("Leads go cold", "Reply the next morning and they\u2019ve already booked the company that answered first."),
              ("Rebooking regulars", "Weekly and monthly clients need reminders and rebooking, done by hand.")],
       sets=["Quotes drafted from your rates per room, frequency and extras", "Bookings offered from your team\u2019s available days", "Regulars reminded and rebooked", "Complaints and special requests passed to you", "Optional: a website with an instant quote tool"],
       faq=[("Will the quote match my prices?", "Yes. It works only from the rates you give us, and anything unusual is left for you to price."),
            ("Can it handle repeat clients?", "Yes: reminders and rebooking for weekly and monthly clients, with changes passed to you."),
            ("Do I still need a website?", "Not to start. A site with an instant quote tool is an add-on from R12,500.")]),
]

CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>'
e = html.escape

def head(ind):
    url = f"{SITE}/for-{ind['slug']}"
    faq_ld = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in ind["faq"]]}
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": ind["label"], "item": url}]}
    ld = json.dumps({"@context": "https://schema.org", "@graph": [crumbs, faq_ld]}, ensure_ascii=False, indent=2)
    return f"""<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{e(ind['title'])}</title>
  <meta name="description" content="{e(ind['desc'])}" />
  <link rel="canonical" href="{url}" />
  <meta name="robots" content="noindex, follow" />
  <meta name="theme-color" content="#f7f7f7" />

  <meta property="og:url" content="{url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Re-Charge" />
  <meta property="og:title" content="{e(ind['title'])}" />
  <meta property="og:description" content="{e(ind['desc'])}" />
  <meta property="og:image" content="{SITE}/og-image.png?v=5" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="en_ZA" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{e(ind['title'])}" />
  <meta name="twitter:description" content="{e(ind['desc'])}" />
  <meta name="twitter:image" content="{SITE}/og-image.png?v=5" />

  <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png?v=7" />
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png?v=7" />
  <link rel="manifest" href="site.webmanifest" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" media="print" onload="this.media=&#39;all&#39;" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" /></noscript>
  <link rel="stylesheet" href="styles.css?v=20261017e" />

  <script type="application/ld+json">
{ld}
  </script>
</head>
<body>
"""

def body(ind):
    others = [o for o in INDUSTRIES if o["slug"] != ind["slug"]]
    pains = "".join(f"""
          <div class="card reveal"><span class="card__icon" aria-hidden="true">{CHECK}</span><h3>{e(t)}</h3><p>{e(d)}</p></div>""" for t, d in ind["pains"])
    sets = "".join(f"\n            <li>{CHECK} <span>{e(b)}</span></li>" for b in ind["sets"])
    faq = "".join(f"""
          <details class="faq__item"><summary>{e(q)}</summary><p>{e(a)}</p></details>""" for q, a in ind["faq"])
    other_links = " · ".join(f'<a class="inline-link" href="for-{o["slug"]}">{e(o["label"])}</a>' for o in others)
    demo = f"live-demo?sample={ind['demo_kind']}"
    return f"""
  <main id="main">

    <section class="page-head industry-head page-head--art">
      <div class="container">
        <span class="eyebrow">For {e(ind['label'].lower())}</span>
        <h1>{e(ind['h1'])}</h1>
        <figure class="ph-art ph-art--phone" aria-hidden="true"><img src="{ind['demo_img']}" alt="" width="{ind['demo_w']}" height="{ind['demo_h']}" /></figure>
        <p class="lead">{e(ind['lead'])}</p>
        <div class="btn-row" style="margin-top:1.4rem">
          <a class="btn btn--primary btn--large" href="https://calendar.app.google/58FYamh1ahXB4khM9" target="_blank" rel="noopener" data-track="cta-{ind['slug']}-book">Book a free 30-minute call</a>
          <a href="{demo}" class="btn btn--ghost btn--large">See it answer one</a>
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
          <h2 id="setTitle">AI drafts the reply. You stay in charge.</h2>
          <ul class="tick-list">{sets}
          </ul>
          <p class="small muted" style="margin-top:1rem">It answers only from your own prices and rules. Anything it isn&rsquo;t sure about goes to a person.</p>
        </div>
        <a class="card card--link work-card reveal" href="{demo}">
          <div class="work-card__body">
            <div class="work-card__meta"><span class="badge badge--concept">Live demo</span><span class="tag tag--muted">Sample work, nothing is sent</span></div>
            <h3>{e(ind['demo_name'])}</h3>
            <p>{e(ind['demo_line'])}</p>
            <div class="card__foot"><span class="card__more">Run it yourself</span></div>
          </div>
        </a>
      </div>
    </section>

    <section class="section" id="pricing" aria-labelledby="priceTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">What it costs</span><h2 id="priceTitle">A fixed price before anything starts.</h2></div>
        <div class="grid grid--2 industry-pricing">
          <ul class="price-list reveal">
            <li><div class="pl-name">Message and enquiry assistant<small>Replies drafted from your prices and diary, on WhatsApp and your website</small></div><span class="price"><small>from</small>R25,000</span></li>
            <li><div class="pl-name">Keeping it running<small>We look after it, keep it accurate and send a monthly time-saved report</small></div><span class="price"><small>from</small>R7,500<span class="per">/mo</span></span></li>
            <li><div class="pl-name">Customer email first?<small>The Inbox Assistant drafts routine email replies, R1,500 deposit, the rest only once it saves 5 hours a week</small></div><span class="price"><small>setup</small>R9,500</span></li>
            <li><div class="pl-name">Add a website<small>Prices, gallery, Book and WhatsApp buttons</small></div><span class="price"><small>from</small>R12,500</span></li>
          </ul>
          <div class="card card--tint reveal">
            <h3>Not sure it&rsquo;s worth it?</h3>
            <p>That&rsquo;s what the free call is for. Tell us roughly how many messages and calls you get. We&rsquo;ll tell you honestly whether AI would save real hours, and if not, we&rsquo;ll say so.</p>
            <p class="small muted" style="margin-top:0.8rem">Prices are starting points for typical {e(ind['plural'])}. Your quote is fixed before we begin. <a class="inline-link" href="pricing">Full price list &rarr;</a></p>
          </div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="howTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">How it works</span><h2 id="howTitle">From first call to answered messages.</h2></div>
        <ol class="steps reveal">
          <li class="step"><span class="step__num">1</span><h3>Free 30-minute call</h3><p>You tell us what comes in and what eats your day. We say honestly whether AI fits.</p></li>
          <li class="step"><span class="step__num">2</span><h3>Fixed quote</h3><p>Exactly what it will do and what it costs. Nothing starts until you&rsquo;ve said yes.</p></li>
          <li class="step"><span class="step__num">3</span><h3>Tested on real messages</h3><p>It drafts replies to your real enquiries first, so you see it working before it goes live.</p></li>
          <li class="step"><span class="step__num">4</span><h3>Running, and measured</h3><p>We look after it and send you the time it saved each month.</p></li>
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
        <span class="cta__services">For {e(ind['label'].lower())}</span>
        <h2 id="ctaTitle">Tell us what takes too long.</h2>
        <p>A free 30-minute call. You leave with a rough price, or an honest &ldquo;not worth it&rdquo;.</p>
        <div class="btn-row btn-row--center">
          <a class="btn btn--light btn--large" href="https://calendar.app.google/58FYamh1ahXB4khM9" target="_blank" rel="noopener" data-track="cta-{ind['slug']}-book-end">Book a free 30-minute call</a>
        </div>
        <p class="small muted" data-contact-block hidden>Rather message? <a class="inline-link" href="#" data-contact="whatsapp" hidden>WhatsApp us</a></p>
      </div>
    </section>

  </main>
"""

for ind in INDUSTRIES:
    open(f"src/for-{ind['slug']}.body.head", "w").write(head(ind))
    open(f"src/for-{ind['slug']}.body", "w").write(body(ind))
print("generated", ", ".join(f"for-{i['slug']}" for i in INDUSTRIES))
