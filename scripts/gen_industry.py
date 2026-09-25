#!/usr/bin/env python3
"""Generate the industry landing pages (src/for-<slug>.body + .body.head).
Run:  python3 scripts/gen_industry.py && for p in for-salons for-plumbers for-restaurants for-cleaners; do bash src/build.sh $p src/$p.body > $p.html; done
Edit the INDUSTRIES data below to change copy; keep facts consistent with pricing.html."""
import html, json, datetime

SITE = "https://re-charge.co.za"
INDUSTRIES = [
  dict(slug="salons", noun="salon", plural="salons", label="Hair & beauty salons",
       title="Websites for Salons — Online Booking, Prices & WhatsApp | Re-Charge",
       desc="A website for your salon that shows prices, a gallery and lets clients book on WhatsApp or online. Built by Re-Charge from R1,000; free mockup first.",
       h1="Fill your chair, not your DMs.",
       lead="Clients want to see your prices, your work and an open slot — on their phone, at 9pm. A salon website does that while you're busy with the client in front of you.",
       wants=[("Prices before they call", "Half of your enquiries are \"how much for a cut and colour?\". A price list on your site answers it, and the ones who message are ready to book."),
              ("Your work, not stock photos", "A gallery of real results is what makes someone choose you over the salon down the road."),
              ("A way to book that isn't a phone call", "A Book button that opens WhatsApp with the service pre-filled — or a proper online calendar if you want no back-and-forth at all.")],
       build=["A one-page or multi-page site with your services and prices", "A gallery you can update from your phone", "\"Book on WhatsApp\" with the service and time pre-filled", "Optional: real online booking with a calendar and reminders", "Google Maps, opening hours, Instagram link", "Set up on Google so you show up for \"salon near me\""],
       demo=dict(img="assets/demo-booking.png", href="demos#booking", name="Bella Hair Studio — Online Booking", line="A demo salon site where clients pick a service, a day and a time, and book themselves in."),
       prices=[("Quick salon site", "One page: services, prices, gallery, WhatsApp booking, Maps", "R1,000"),
               ("Salon website", "4–5 pages, bigger gallery, team, price list, contact form", "R2,000"),
               ("Salon site with online booking", "Real calendar booking, reminders, deposits if you want them", "R4,500")],
       faq=[("Can clients book without WhatsApp?", "Yes. The quick and business sites use a WhatsApp booking button because it's what most salons already run on. If you'd rather have a calendar where clients pick a slot and get a reminder, that's the online-booking option from R4,500."),
            ("I don't have professional photos.", "Phone photos of your real work are better than stock images for a salon. We'll lay them out so they look good, and you can swap them any time."),
            ("Can I change prices myself?", "Yes — small updates like prices and hours are included on the Hosting & Care plan, or we set the site up so you can edit them yourself.")],
       mockup_hint="e.g. Bella Hair Studio — a salon in Durban, cuts, colour and nails"),
  dict(slug="plumbers", noun="plumbing business", plural="plumbers", label="Plumbers & trades",
       title="Websites for Plumbers & Trades — Get Found, Get Called | Re-Charge",
       desc="A website for your plumbing or trade business: found on Google, a tap-to-call button and an instant quote tool. Built by Re-Charge from R1,000; free mockup first.",
       h1="When the geyser bursts, be the plumber they find.",
       lead="Emergency jobs go to whoever shows up on the phone first with a number to tap. A simple, fast site gets you found on Google Maps and called before the next guy.",
       wants=[("Found on Google, fast", "\"Plumber near me\" at 6am on a Sunday. Your site plus a Google Business listing is how you appear — and how they see you're real."),
              ("Tap to call, tap to WhatsApp", "No forms. A big Call button and a WhatsApp button with \"Hi, I need a plumber in …\" already typed."),
              ("A rough price before the call", "An instant quote tool for common jobs (geyser, blocked drain, leak) filters out the time-wasters and gets you the serious ones.")],
       build=["A one-page site that loads fast on a phone with a weak signal", "Call and WhatsApp buttons that work with one tap", "Your services, areas you cover, and emergency hours", "Optional: an instant quote calculator customers can send to you", "Google Business Profile set up so you appear on Maps", "Photos of real jobs, a few reviews, your licence/insurance line"],
       demo=dict(img="assets/demo-quote-calculator.png", href="demos#quote-calculator", name="Mike's Plumbing — Quote Calculator", line="A demo where a customer picks the job and gets an instant estimate they send straight to WhatsApp."),
       prices=[("Quick trade site", "One page: services, areas, Call + WhatsApp, Maps, reviews", "R1,000"),
               ("Business website", "4–5 pages, service pages that rank on Google, gallery, form", "R2,000"),
               ("Site with instant quote tool", "Customers price common jobs themselves and send you the quote", "R4,500")],
       faq=[("I get all my work from word of mouth. Why a site?", "Word of mouth still ends with someone Googling your name to check you're real and get your number. A site with your jobs, areas and a tap-to-call button closes that gap — and Maps brings the emergency jobs word of mouth can't."),
            ("Can you set up Google Maps for me?", "Yes. We set up or tidy your Google Business Profile so the listing, hours, photos and website link all match."),
            ("Do I need to write anything?", "No. Tell us your services and areas on WhatsApp or in the builder; we write the rest and you approve it.")],
       mockup_hint="e.g. Mike's Plumbing — geysers, drains and leaks in the East Rand"),
  dict(slug="restaurants", noun="restaurant", plural="restaurants", label="Restaurants & takeaways",
       title="Websites for Restaurants & Takeaways — Menu, Maps, WhatsApp Orders | Re-Charge",
       desc="A restaurant website with a digital menu, opening hours, Google Maps and WhatsApp ordering. Built by Re-Charge from R1,000; free mockup first.",
       h1="Your menu, your hours, your orders — one tap away.",
       lead="People decide where to eat on their phones. If your menu is a blurry photo on Facebook, they pick the place that made it easy.",
       wants=[("The menu, with prices, that loads instantly", "Not a PDF. A menu they can scroll on a phone, with today's specials at the top."),
              ("Are you open, and where exactly?", "Hours, Maps directions and a phone number — the three things every hungry person checks first."),
              ("Order or book without calling", "A WhatsApp order button with the menu items pre-filled, or a table booking request. No app fees, no commission.")],
       build=["A one-page site with your full menu and specials", "Opening hours, Google Maps, call and WhatsApp buttons", "WhatsApp ordering with the item and quantity pre-filled", "Optional: table booking requests, event bookings", "Photos laid out so the food does the selling", "Set up on Google so you appear for \"pizza near me\""],
       demo=dict(img=None, href="start?type=Website", name="Local Burger Co. — Restaurant Website", line="A one-page site with a digital menu, specials, Maps and a WhatsApp order button."),
       prices=[("Quick restaurant site", "One page: menu, specials, hours, Maps, WhatsApp orders", "R1,000"),
               ("Restaurant website", "Menu pages, gallery, events, booking requests, contact form", "R2,000"),
               ("Online ordering", "Customers build an order and pay online; you get it on WhatsApp or a screen in the kitchen", "R4,500")],
       faq=[("Can I update the menu and specials myself?", "Yes. Price and specials changes are included on the Hosting & Care plan, or we set it up so you can edit the menu from your phone."),
            ("Do you charge commission on orders?", "No. WhatsApp ordering has no per-order fees. Online payments go through Yoco at their normal card rate — nothing to us."),
            ("Can it show today's specials?", "Yes — a specials block at the top of the menu that you can change in a minute.")],
       mockup_hint="e.g. Local Burger Co. — burgers and shakes in Melville, WhatsApp orders"),
  dict(slug="cleaners", noun="cleaning business", plural="cleaners", label="Cleaning services",
       title="Websites for Cleaning Services — Instant Quotes & Bookings | Re-Charge",
       desc="A website for your cleaning service with an instant quote tool, WhatsApp booking and Google Maps. Built by Re-Charge from R1,000; free mockup first.",
       h1="Quote in seconds. Book in one tap.",
       lead="Every cleaning enquiry starts with \"how much for a 3-bedroom house?\". Put the answer on your site and the serious clients book themselves in.",
       wants=[("A price without a phone call", "An instant quote: rooms, frequency, extras — and a number. The ones who message after that are ready to book."),
              ("Proof you're reliable", "Reviews, a real photo of you or the team, and what's included. Trust is the whole sale in cleaning."),
              ("Easy repeat bookings", "Weekly or monthly clients want to rebook in one tap, not re-explain everything each time.")],
       build=["A one-page site with services, areas and what's included", "An instant quote tool customers can send to you on WhatsApp", "Booking via WhatsApp, or a proper booking form with dates", "Reviews and before/after photos", "Optional: monthly invoicing and reminders for regular clients", "Google Business Profile so you appear for \"cleaning services near me\""],
       demo=dict(img="assets/demo-invoice.png", href="demos#invoice", name="Nomsa's Cleaning Services — Instant Quote", line="A demo where a customer picks the size of the home and extras and gets a quote they can send on WhatsApp."),
       prices=[("Quick cleaning site", "One page: services, areas, what's included, WhatsApp booking", "R1,000"),
               ("Business website", "4–5 pages, service pages, reviews, gallery, booking form", "R2,000"),
               ("Site with instant quote tool", "Customers quote themselves; regulars rebook and get reminders", "R4,500")],
       faq=[("Can the quote tool use my real prices?", "Yes. You give us your rates per room, frequency and extras; the tool calculates from those, and we can change them any time."),
            ("Can clients pay online?", "Yes, if you want that — deposits or full payment through Yoco. Many cleaning businesses prefer EFT after the job, and that works too."),
            ("Do I need a logo?", "No. We'll make a clean text logo to start, and you can replace it later.")],
       mockup_hint="e.g. Nomsa's Cleaning — homes and offices in Pretoria East, weekly and once-off"),
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
  <meta name="theme-color" content="#0a0d13" />

  <meta property="og:url" content="{url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Re-Charge" />
  <meta property="og:title" content="{e(ind['title'])}" />
  <meta property="og:description" content="{e(ind['desc'])}" />
  <meta property="og:image" content="{SITE}/og-image.png?v=2" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="en_ZA" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{e(ind['title'])}" />
  <meta name="twitter:description" content="{e(ind['desc'])}" />
  <meta name="twitter:image" content="{SITE}/og-image.png?v=2" />

  <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png?v=6" />
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png?v=6" />
  <link rel="manifest" href="site.webmanifest" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" media="print" onload="this.media=&#39;all&#39;" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" /></noscript>
  <link rel="stylesheet" href="styles.css" />

  <script type="application/ld+json">
{ld}
  </script>
</head>
<body>
"""

def body(ind):
    others = [o for o in INDUSTRIES if o["slug"] != ind["slug"]]
    wants = "".join(f"""
          <div class="card reveal"><span class="card__icon" aria-hidden="true">{CHECK}</span><h3>{e(t)}</h3><p>{e(d)}</p></div>""" for t, d in ind["wants"])
    build = "".join(f"\n            <li>{CHECK} <span>{e(b)}</span></li>" for b in ind["build"])
    d = ind["demo"]
    demo_media = (f'<img class="work-card__img" src="{d["img"]}" alt="Screenshot of the {e(d["name"])} demo" loading="lazy" decoding="async" />' if d["img"]
                  else '<div class="mock" aria-hidden="true"><div class="mock__window"><div class="mock__nav"><span class="mock__bar mock__bar--accent" style="width:28px"></span><span class="mock__bar" style="width:36%"></span><span class="mock__bar" style="width:24px"></span></div><div class="mock__hero"></div><div class="mock__row"><div class="mock__tile"></div><div class="mock__tile"></div><div class="mock__tile"></div></div></div></div>')
    prices = "".join(f"""
            <li><div class="pl-name">{e(n)}<small>{e(s)}</small></div><span class="price"><small>from</small>{e(p)}</span></li>""" for n, s, p in ind["prices"])
    faq = "".join(f"""
          <details class="faq__item"><summary>{e(q)}</summary><p>{e(a)}</p></details>""" for q, a in ind["faq"])
    other_links = " · ".join(f'<a class="inline-link" href="for-{o["slug"]}">{e(o["label"].split(" &")[0].split(" ")[0] if False else o["label"])}</a>' for o in others)
    return f"""
  <main id="main">

    <section class="page-head industry-head">
      <div class="container">
        <span class="eyebrow">For {e(ind['label'].lower())}</span>
        <h1>{e(ind['h1'])}</h1>
        <p class="lead">{e(ind['lead'])}</p>
        <div class="btn-row" style="margin-top:1.4rem">
          <button type="button" class="btn btn--primary btn--large" data-mockup-open data-mockup-hint="{e(ind['mockup_hint'])}">Get a free mockup of your {e(ind['noun'])} site</button>
          <a href="#pricing" class="btn btn--ghost btn--large">See what it costs</a>
        </div>
        <p class="hero__freebie"><span class="hero__freebie-tag">Free</span> We build a preview of your {e(ind['noun'])} site first — no deposit, no obligation. Projects from R1,000; R500 to start, refundable until you approve the quote.</p>
      </div>
    </section>

    <section class="section" aria-labelledby="wantsTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">What your customers check first</span><h2 id="wantsTitle">Three things every {e(ind['noun'])} website has to do.</h2></div>
        <div class="grid grid--3">{wants}
        </div>
      </div>
    </section>

    <section class="section section--tint" aria-labelledby="buildTitle">
      <div class="container service__grid">
        <div class="reveal">
          <span class="eyebrow">What we'd build</span>
          <h2 id="buildTitle">A {e(ind['noun'])} site that does the selling for you.</h2>
          <ul class="tick-list">{build}
          </ul>
          <div class="btn-row" style="margin-top:1.2rem"><a href="start?type=Website" class="btn btn--primary">Start a Project</a><button type="button" class="btn btn--ghost" data-mockup-open data-mockup-hint="{e(ind['mockup_hint'])}">Free mockup first</button></div>
        </div>
        <a class="card card--link work-card reveal" href="{d['href']}">
          {demo_media}
          <div class="work-card__body">
            <div class="work-card__meta"><span class="badge badge--concept">{'Live demo' if d['img'] else 'Concept'}</span><span class="tag tag--muted">Website</span></div>
            <h3>{e(d['name'])}</h3>
            <p>{e(d['line'])}</p>
            <div class="card__foot"><span class="card__more">{'See it live' if d['img'] else 'Build this'}</span></div>
          </div>
        </a>
      </div>
    </section>

    <section class="section" id="pricing" aria-labelledby="priceTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">What it costs</span><h2 id="priceTitle">Fixed prices. Nothing starts until you've approved a quote.</h2></div>
        <div class="grid grid--2 industry-pricing">
          <ul class="price-list reveal">{prices}
            <li><div class="pl-name">Hosting &amp; care<small>Keeps the site online; small updates included on the Care plan</small></div><span class="price"><small>from</small>R400<span class="per">/yr</span></span></li>
          </ul>
          <div class="card card--tint reveal">
            <h3>First year, all in</h3>
            <p>A quick {e(ind['noun'])} site (R1,000) plus a year of hosting (R400) is <strong>R1,400</strong>. Pay R500 to start; the rest on approval of the fixed quote. Domain and any third-party fees are separate and agreed first.</p>
            <p class="small muted" style="margin-top:0.8rem">Prices are starting points for typical {e(ind['plural'])}. Your quote is fixed before we begin. <a class="inline-link" href="pricing">Full price list →</a></p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--tint" aria-labelledby="howTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">How it works</span><h2 id="howTitle">From "we should really have a website" to live.</h2></div>
        <ol class="steps reveal">
          <li class="step"><span class="step__num">1</span><h3>Free mockup</h3><p>Tell us about your {e(ind['noun'])}. We build a preview so you can see it before deciding anything.</p></li>
          <li class="step"><span class="step__num">2</span><h3>R500 to start</h3><p>Like the direction? R500 reserves your slot — refundable until you approve the quote.</p></li>
          <li class="step"><span class="step__num">3</span><h3>Fixed quote</h3><p>We confirm exactly what's included and the price. No surprises later.</p></li>
          <li class="step"><span class="step__num">4</span><h3>Build &amp; launch</h3><p>Quick sites go live in days. You own the domain; we host and look after it if you want.</p></li>
        </ol>
      </div>
    </section>

    <section class="section" aria-labelledby="faqTitle">
      <div class="container container--narrow">
        <div class="section__head reveal"><span class="eyebrow">Questions {e(ind['plural'])} ask</span><h2 id="faqTitle">Straight answers.</h2></div>
        <div class="faq reveal">{faq}
        </div>
        <p class="small muted" style="margin-top:1.2rem">More in the <a class="inline-link" href="/#faq">general FAQ</a>. Also built for: {other_links}.</p>
      </div>
    </section>

    <section class="cta" aria-labelledby="ctaTitle">
      <div class="container cta__inner reveal">
        <span class="cta__services">For {e(ind['label'].lower())}</span>
        <h2 id="ctaTitle">See your {e(ind['noun'])} online before you pay a cent.</h2>
        <p>Give us the name, what you do and what you'd like on the site. We'll send a free preview.</p>
        <div class="btn-row btn-row--center">
          <button type="button" class="btn btn--light btn--large" data-mockup-open data-mockup-hint="{e(ind['mockup_hint'])}">Get a free mockup</button>
          <a href="start?type=Website" class="btn btn--ghost-light btn--large">Start a Project</a>
        </div>
        <p class="small muted" data-contact-block hidden>Prefer to talk first? <a class="inline-link" href="#" data-contact="whatsapp" hidden>WhatsApp us</a></p>
      </div>
    </section>

  </main>
"""

for ind in INDUSTRIES:
    open(f"src/for-{ind['slug']}.body.head", "w").write(head(ind))
    open(f"src/for-{ind['slug']}.body", "w").write(body(ind))
print("generated", ", ".join(f"for-{i['slug']}" for i in INDUSTRIES))
