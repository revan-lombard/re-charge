#!/usr/bin/env python3
"""Generate the "areas we serve" pages: a national hub (website-design-south-africa) and one page per
major city (website-design-<city>). Re-Charge works fully online, so every city gets the same prices and
process; what differs, and must stay different, is each page's local content (Google penalises
copy-paste city pages). Keep prices consistent with src/pricing.body.

Run:  python3 scripts/gen_areas.py && for p in $(python3 scripts/gen_areas.py --list); do bash src/build.sh $p src/$p.body > $p.html; done
"""
import html, json, sys

SITE = "https://re-charge.co.za"
e = html.escape

CITIES = [
  dict(slug="johannesburg", city="Johannesburg", province="Gauteng",
       title="Website Design Johannesburg from R1,000 | Re-Charge",
       desc="Websites for Johannesburg businesses from R1,000, with a free mockup first. Fixed quotes, built fully online, and found on Google across Joburg.",
       h1="Websites for Johannesburg businesses that get you found first.",
       lead="Joburg is the busiest place in the country to compete on Google. When someone searches for a plumber in Randburg or a salon in Sandton, the businesses with a proper website and Google profile get the call.",
       why="In Johannesburg there's almost always someone else offering what you do a few kilometres away. Customers compare two or three businesses on their phone before they call, and the one that shows prices, real photos and a WhatsApp button usually wins. A fast, simple site is how a small business holds its own next to bigger competitors.",
       searches=["plumber Randburg", "hair salon Sandton", "electrician Roodepoort"],
       areas=["Sandton", "Randburg", "Roodepoort", "Soweto", "Midrand", "Fourways", "Rosebank", "Melville", "Northcliff", "Bryanston"],
       industries=[("Trades and home services", "Plumbers, electricians and handymen covering the northern and western suburbs.", "for-plumbers"),
                   ("Salons and beauty", "Hair, nails and beauty studios that want bookings without the back-and-forth.", "for-salons"),
                   ("Professional services", "Accountants, consultants and practices that need to look established online.", None),
                   ("Restaurants and takeaways", "Menus, hours and WhatsApp orders that work on a phone.", "for-restaurants")],
       faq=[("Do you have an office in Johannesburg?", "No, and you won't need one. We work fully online: you tell us about your business on WhatsApp or the form, we send a free mockup to your phone, and we only talk on a video call if you'd like to. Same prices as everywhere in South Africa."),
            ("Can you help me show up in my suburb's searches?", "Yes. A site that names the areas you serve, plus a properly set-up Google Business Profile with the right service area, is what gets you into searches like \"plumber Randburg\". We do both."),
            ("I'm competing with much bigger businesses. Is a R1,000 site enough?", "For most small businesses, yes: what wins is clear prices, real photos and an easy way to contact you, not a big site. If you need more later, we build on what you have.")],
       mockup_hint="e.g. Thabo's Plumbing — geysers and leaks in Randburg and Roodepoort"),
  dict(slug="cape-town", city="Cape Town", province="Western Cape",
       title="Website Design Cape Town from R1,000 | Re-Charge",
       desc="Websites for Cape Town businesses from R1,000, free mockup first. Built fully online for guesthouses, restaurants, salons and trades across the city.",
       h1="Websites for Cape Town businesses, built to be booked.",
       lead="Locals and visitors alike find Cape Town businesses on their phones, often in a hurry and often from out of town. If they can't see your prices, photos and how to book, they move on to the next result.",
       why="Cape Town has a big share of customers who've never heard of you: visitors, people new to the area, and locals trying somewhere new. They decide from what they see online, so photos, reviews and a booking button matter more here than almost anywhere. A site that loads fast on a phone and links to your Google profile turns that first look into a booking.",
       searches=["guesthouse Durbanville", "restaurant Claremont", "cleaning service Bellville"],
       areas=["Bellville", "Durbanville", "Claremont", "Table View", "Somerset West", "Mitchells Plain", "Observatory", "Milnerton", "Kuils River", "Fish Hoek"],
       industries=[("Guesthouses and stays", "Photos, rooms and a direct booking or enquiry button, so you rely less on booking sites.", None),
                   ("Restaurants and cafés", "A menu that loads instantly, today's specials and WhatsApp orders.", "for-restaurants"),
                   ("Salons and wellness", "Price lists, galleries and booking on WhatsApp or online.", "for-salons"),
                   ("Trades and cleaning", "Found on Google from the Northern Suburbs to the Southern Peninsula.", "for-cleaners")],
       faq=[("Can a website help me rely less on booking platforms?", "Yes. A good site with clear rooms, prices and a direct enquiry or booking button lets returning guests and people who find you on Google book with you directly, without the platform's commission."),
            ("Do you need to visit to take photos?", "No. Phone photos of your real space and work are better than stock images, and we'll lay them out so they look good. We work fully online, with a video call if you'd like one."),
            ("Can visitors see if I have rooms or tables free?", "Yes. The quick site sends enquiries straight to your WhatsApp; if you want guests to pick dates themselves, we can build real online booking from R4,500.")],
       mockup_hint="e.g. Fynbos Guesthouse — four rooms in Durbanville, direct bookings"),
  dict(slug="durban", city="Durban", province="KwaZulu-Natal",
       title="Website Design Durban from R1,000 | Re-Charge",
       desc="Websites for Durban businesses from R1,000, free mockup first. Fixed quotes, built fully online, for salons, restaurants, trades and more across eThekwini.",
       h1="Websites for Durban businesses, from Umhlanga to the South Coast.",
       lead="From Umhlanga to Amanzimtoti, people in Durban look a business up before they call. A clear website with your prices, photos and a WhatsApp button is often the difference between a call and a scroll past.",
       why="Durban's small businesses run on WhatsApp and word of mouth, and both end with someone checking you online. A website gives them somewhere to land: your services, your prices, where you are and one tap to message you. Paired with your Google profile, it also brings in people who've never heard of you.",
       searches=["hair salon Umhlanga", "plumber Pinetown", "takeaway Westville"],
       areas=["Umhlanga", "Westville", "Pinetown", "Ballito", "Chatsworth", "Amanzimtoti", "Durban North", "Berea", "Hillcrest", "Phoenix"],
       industries=[("Salons and barbers", "Booking on WhatsApp, price lists and a gallery of your real work.", "for-salons"),
                   ("Restaurants and takeaways", "Menus, specials and WhatsApp orders without app commission.", "for-restaurants"),
                   ("Trades and home services", "Found on Google across eThekwini, with tap-to-call and quotes.", "for-plumbers"),
                   ("Tourism and stays", "Beachfront guesthouses and activities that want direct bookings.", None)],
       faq=[("Do you work with businesses outside central Durban?", "Yes, from Ballito to the South Coast and inland to Hillcrest and Pietermaritzburg. We work fully online, so where you are doesn't change the price or the process."),
            ("My customers all use WhatsApp. Do I still need a site?", "WhatsApp is perfect for the conversation, but people still need to find you and trust you first. The site does that, and every button on it opens WhatsApp with a message ready to send."),
            ("Can you set up my Google Maps listing too?", "Yes. Our Google profile setup is R450 once-off, and it comes off your website if you build one with us within 90 days.")],
       mockup_hint="e.g. Naidoo's Hair & Beauty — a salon in Westville, booking on WhatsApp"),
  dict(slug="pretoria", city="Pretoria", province="Gauteng",
       title="Website Design Pretoria from R1,000 | Re-Charge",
       desc="Websites for Pretoria and Centurion businesses from R1,000, free mockup first. Fixed quotes and fully online, from Hatfield to Montana.",
       h1="Websites for Pretoria and Centurion businesses.",
       lead="From Centurion to Montana, Pretoria customers want to see a business is real before they get in touch. A professional site with clear services, prices and contact options does that in seconds.",
       why="Pretoria has a lot of customers who check carefully before they choose: professionals, families and students around the universities. They look for proof that you're established, like real photos, clear prices, reviews and easy contact. A clean, fast website gives you that credibility, even if you're just starting out.",
       searches=["accountant Centurion", "cleaning service Pretoria East", "salon Hatfield"],
       areas=["Centurion", "Hatfield", "Menlyn", "Brooklyn", "Montana", "Mamelodi", "Pretoria East", "Garsfontein", "Faerie Glen", "Akasia"],
       industries=[("Professional services", "Accountants, consultants and practices that need to look established.", None),
                   ("Cleaning services", "Instant quotes for homes and offices, and booking in one tap.", "for-cleaners"),
                   ("Student-area businesses", "Cafés, salons and services around Hatfield and Brooklyn.", "for-salons"),
                   ("Trades", "Plumbers and electricians found on Google from Centurion to Pretoria North.", "for-plumbers")],
       faq=[("Do you cover Centurion and the East as well?", "Yes, and anywhere else in South Africa. We work fully online, so you get the same process and prices wherever you are."),
            ("Can my site show that I'm properly registered?", "Yes. We can add your registration and VAT numbers, professional body memberships and any certificates. For many Pretoria customers that's what builds trust."),
            ("How quickly can I be live?", "A quick one-page site is usually live within days of you approving the mockup and sending your details. Bigger sites take a little longer, and the timeline is in your fixed quote.")],
       mockup_hint="e.g. Pretorius Accounting — bookkeeping and tax for small businesses in Centurion"),
  dict(slug="gqeberha", city="Gqeberha", province="Eastern Cape",
       title="Website Design Gqeberha (Port Elizabeth) | Re-Charge",
       desc="Websites for Gqeberha (Port Elizabeth), Kariega and Nelson Mandela Bay businesses from R1,000. Free mockup first, fixed quotes, built fully online.",
       h1="Websites for Gqeberha and Nelson Mandela Bay businesses.",
       lead="Whether customers still call it PE or Gqeberha, they find local businesses the same way: on their phone, on Google. A clear website makes sure they find you, not just the bigger names.",
       why="In Nelson Mandela Bay, plenty of good businesses still have no website, or one that's years out of date, so a fast, modern site stands out quickly. It also helps with the name change: we make sure your site and Google profile mention both Gqeberha and Port Elizabeth, so you show up whichever one people type.",
       searches=["plumber Port Elizabeth", "salon Walmer", "restaurant Summerstrand"],
       areas=["Walmer", "Summerstrand", "Newton Park", "Kariega (Uitenhage)", "Despatch", "Lorraine", "Mill Park", "Humewood", "Motherwell", "Bluewater Bay"],
       industries=[("Trades and services", "Found on Google across the Bay, with tap-to-call and WhatsApp.", "for-plumbers"),
                   ("Restaurants and tourism", "Seafront spots and activities that want visitors to book directly.", "for-restaurants"),
                   ("Salons and beauty", "Price lists, galleries and easy booking.", "for-salons"),
                   ("Suppliers and small manufacturers", "A professional face for businesses that sell to other businesses.", None)],
       faq=[("Should my site say Gqeberha or Port Elizabeth?", "Both. Lots of people still search \"Port Elizabeth\", so we use both names on your site and in your Google profile, so you're found either way."),
            ("Do you work with Kariega and Despatch businesses?", "Yes, and anywhere else in South Africa. We work fully online, so where you are doesn't change the price or the process."),
            ("I sell to other businesses, not the public. Is a website still worth it?", "Yes. Buyers check suppliers online before they ask for a quote. A site with your products, capabilities and contact details makes you look like a safe choice.")],
       mockup_hint="e.g. Bay Auto Electrical — vehicle electrics in Newton Park, Gqeberha"),
  dict(slug="bloemfontein", city="Bloemfontein", province="Free State",
       title="Website Design Bloemfontein from R1,000 | Re-Charge",
       desc="Websites for Bloemfontein and Mangaung businesses from R1,000. Free mockup first, fixed quotes, built fully online for the Free State.",
       h1="Websites for Bloemfontein businesses.",
       lead="In Bloemfontein, a lot of business still comes through people you know, but those people still look you up before they call. A website makes that first check a good one.",
       why="Bloemfontein's customers include students, professionals and the farms and towns around the city, many of whom find businesses online first. A site with your services, prices and contact details works for all of them, and a properly set-up Google profile helps people from the surrounding towns find you too.",
       searches=["plumber Bloemfontein", "salon Brandwag", "tutor Bloemfontein"],
       areas=["Westdene", "Brandwag", "Langenhoven Park", "Universitas", "Bayswater", "Fichardt Park", "Heidedal", "Botshabelo", "Thaba Nchu", "Dan Pienaar"],
       industries=[("Student-area services", "Cafés, salons, tutors and services around the university.", "for-salons"),
                   ("Trades and home services", "Found on Google across Mangaung, with tap-to-call and quotes.", "for-plumbers"),
                   ("Agricultural and rural services", "Suppliers and service providers to the farms around the city.", None),
                   ("Professional practices", "Firms and practices that need a credible, simple site.", None)],
       faq=[("Do you cover the towns around Bloemfontein?", "Yes. We work fully online across South Africa, so businesses in Botshabelo, Thaba Nchu or anywhere in the Free State get the same service and prices."),
            ("I mostly get work through people I know. Why do I need a site?", "Because even referred customers look you up before they call. A site with your services, prices and contact details makes their first check a good one, and helps them pass your details on."),
            ("Will I be able to update it myself?", "Small changes like prices, hours and photos are included in the Care plan, or we set the site up so you can do them yourself.")],
       mockup_hint="e.g. Van der Merwe Elektries — electrical work in Langenhoven Park"),
  dict(slug="east-london", city="East London", province="Eastern Cape",
       title="Website Design East London from R1,000 | Re-Charge",
       desc="Websites for East London and Buffalo City businesses from R1,000. Free mockup first, fixed quotes, built fully online for the Border region.",
       h1="Websites for East London and Buffalo City businesses.",
       lead="From Beacon Bay to Mdantsane, East London customers look businesses up on their phones first. A clear, fast website makes sure what they find is you.",
       why="Many East London businesses rely on regular customers and word of mouth, which works until someone new moves to the area or searches for what you do. A simple website and a well set-up Google profile bring in those new customers, and give your regulars an easy way to share your details.",
       searches=["plumber East London", "salon Beacon Bay", "takeaway Vincent"],
       areas=["Beacon Bay", "Vincent", "Gonubie", "Nahoon", "Mdantsane", "Quigney", "Berea", "Cambridge", "King William's Town (Qonce)", "Amalinda"],
       industries=[("Trades and services", "Found on Google across Buffalo City, with tap-to-call and WhatsApp.", "for-plumbers"),
                   ("Salons and beauty", "Booking, prices and a gallery of your real work.", "for-salons"),
                   ("Restaurants and takeaways", "Menus and WhatsApp orders that work on any phone.", "for-restaurants"),
                   ("Suppliers to industry", "A professional site for businesses that supply larger companies.", None)],
       faq=[("Do you work with businesses in Qonce and Mdantsane?", "Yes, and anywhere else in South Africa. We work fully online, so the price and process are the same wherever you are."),
            ("I've got a Facebook page. Isn't that enough?", "Facebook is great for posts, but it's hard to find on Google and you don't control it. A website with your prices and contact details, linked to your Facebook and Google profile, works alongside it."),
            ("Can you help me get more Google reviews?", "Yes. Every site and Google profile setup includes a review card with a QR code, so happy customers can leave a review in seconds.")],
       mockup_hint="e.g. Gonubie Beach Café — breakfasts and coffee, WhatsApp orders"),
  dict(slug="polokwane", city="Polokwane", province="Limpopo",
       title="Website Design Polokwane from R1,000 | Re-Charge",
       desc="Websites for Polokwane and Limpopo businesses from R1,000. Free mockup first, fixed quotes, built fully online across the province.",
       h1="Websites for Polokwane and Limpopo businesses.",
       lead="Polokwane is the business centre for much of Limpopo, and customers from across the province look businesses up online before they make the trip. A website tells them you're the right stop.",
       why="Customers often travel into Polokwane from surrounding towns, so they want to know before they leave: what you offer, what it costs, when you're open and how to find you. A website with that, plus a Google profile with the right hours and directions, saves them a wasted trip and brings them to you.",
       searches=["panel beater Polokwane", "salon Bendor", "tyre shop Polokwane"],
       areas=["Bendor", "Fauna Park", "Seshego", "Westenburg", "Mankweng", "Flora Park", "Ster Park", "Polokwane CBD", "Nirvana", "Ivy Park"],
       industries=[("Automotive and transport", "Panel beaters, tyre shops and mechanics people travel in to.", "for-plumbers"),
                   ("Retail and shops", "Opening hours, stock highlights and directions for out-of-town customers.", None),
                   ("Salons and beauty", "Price lists and booking on WhatsApp.", "for-salons"),
                   ("Agricultural services", "Suppliers and service providers to the farms of the province.", None)],
       faq=[("Do you cover the rest of Limpopo?", "Yes. We work fully online across South Africa, so businesses in Tzaneen, Mokopane, Thohoyandou or anywhere else get the same service and prices."),
            ("Can the site help people find my shop?", "Yes. We add a map, directions and your hours to the site, and set up your Google profile so you appear in Google Maps."),
            ("My customers have slow mobile data. Will the site work?", "Yes. We build sites to load fast on a phone with a weak signal, with small images and no heavy extras.")],
       mockup_hint="e.g. Seshego Tyres & Exhausts — tyres, exhausts and wheel alignment"),
]

PROVINCES = [
  ("Gauteng", ["Johannesburg", "Pretoria", "Ekurhuleni", "Vereeniging"]),
  ("Western Cape", ["Cape Town", "Stellenbosch", "George", "Paarl"]),
  ("KwaZulu-Natal", ["Durban", "Pietermaritzburg", "Richards Bay", "Newcastle"]),
  ("Eastern Cape", ["Gqeberha", "East London", "Mthatha", "Makhanda"]),
  ("Free State", ["Bloemfontein", "Welkom", "Bethlehem", "Kroonstad"]),
  ("Limpopo", ["Polokwane", "Tzaneen", "Mokopane", "Thohoyandou"]),
  ("Mpumalanga", ["Mbombela", "eMalahleni", "Middelburg", "Secunda"]),
  ("North West", ["Rustenburg", "Mahikeng", "Klerksdorp", "Potchefstroom"]),
  ("Northern Cape", ["Kimberley", "Upington", "Springbok", "Kuruman"]),
]

CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>'
PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>'

PIN16 = PIN.replace("<svg ", '<svg width="16" height="16" ', 1)
PIN18 = PIN.replace("<svg ", '<svg width="18" height="18" ', 1)

COMMON_FAQ = [
  ("How does it work if we never meet?", "You tell us about your business on WhatsApp or the short form. We build a free mockup and send you the link to look at on your phone. If you like it, you get a fixed quote online, pay the R500 deposit by card, and we build and launch. If you'd like to talk, we do a quick video call."),
  ("Is it the same price wherever I am?", "Yes. Websites start at R1,000 with a fixed quote before you pay anything, and hosting starts at R50 a month, anywhere in South Africa."),
]

PRICES = """
            <li><div class="pl-name">Quick website<small>One page: services, prices, gallery, WhatsApp, Maps · live in about a day</small></div><span class="price"><small>from</small>R1,000</span></li>
            <li><div class="pl-name">Business website<small>4–5 pages, custom layout, contact form, gallery</small></div><span class="price"><small>from</small>R2,000</span></li>
            <li><div class="pl-name">Custom website<small>Booking, online shop, portals and integrations</small></div><span class="price"><small>from</small>R4,500</span></li>
            <li><div class="pl-name">Google profile setup<small>Claimed, verified and filled in, plus a review QR card</small></div><span class="price">R450</span></li>
            <li><div class="pl-name">Hosting &amp; care<small>Hosting from R50/month; Care (R100/month or R1,000/yr) adds small changes and your Google profile</small></div><span class="price"><small>from</small>R50<span class="per">/mo</span></span></li>"""

def ld_head(url, title, desc, crumbs, faq, service):
    graph = [{"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]},
             {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
             service]
    ld = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=2)
    return f"""<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}" />
  <link rel="canonical" href="{url}" />
  <meta name="theme-color" content="#0a0d13" />

  <meta property="og:url" content="{url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Re-Charge" />
  <meta property="og:title" content="{e(title)}" />
  <meta property="og:description" content="{e(desc)}" />
  <meta property="og:image" content="{SITE}/og-image.png?v=4" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="en_ZA" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{e(title)}" />
  <meta name="twitter:description" content="{e(desc)}" />
  <meta name="twitter:image" content="{SITE}/og-image.png?v=4" />

  <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png?v=7" />
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png?v=7" />
  <link rel="manifest" href="site.webmanifest" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" /></noscript>
  <link rel="stylesheet" href="styles.css" />

  <script type="application/ld+json">
{ld}
  </script>
</head>
<body>
"""

def service_ld(name, url, area):
    return {"@type": "Service", "name": name, "serviceType": "Website design", "url": url,
            "provider": {"@id": SITE + "/#business"}, "areaServed": area,
            "offers": {"@type": "Offer", "price": "1000", "priceCurrency": "ZAR", "description": "Websites from R1,000; free mockup first"}}

def pricing_block(noun="business"):
    return f"""
    <section class="section" id="pricing" aria-labelledby="priceTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">What it costs</span><h2 id="priceTitle">The same fixed prices anywhere in South Africa.</h2></div>
        <div class="grid grid--2 industry-pricing">
          <ul class="price-list reveal">{PRICES}
          </ul>
          <div class="card card--tint reveal">
            <h3>First year, all in</h3>
            <p>A quick website (R1,000) plus the first year of Care (R1,000: hosting, small changes and your Google profile looked after) is <strong>R2,000</strong>. Hosting only is R1,500. Accept the fixed quote online and pay the R500 deposit then; the balance is due on completion. Domain and any third-party fees are separate and agreed first.</p>
            <p class="small muted" style="margin-top:0.8rem">Prices are starting points. Your quote is fixed before we begin. <a class="inline-link" href="pricing">Full price list →</a></p>
          </div>
        </div>
      </div>
    </section>
"""

def remote_steps(where):
    return f"""
        <ol class="steps reveal">
          <li class="step"><span class="step__num">1</span><h3>Tell us on WhatsApp</h3><p>A few lines about your business, or the 30-second form. No meetings, no travel{where}.</p></li>
          <li class="step"><span class="step__num">2</span><h3>Free mockup on your phone</h3><p>We build a preview of your site and send you the link, usually within 2 business days.</p></li>
          <li class="step"><span class="step__num">3</span><h3>Fixed quote, R500 deposit</h3><p>Like it? Accept the fixed quote online and pay the deposit by card. It comes off your total.</p></li>
          <li class="step"><span class="step__num">4</span><h3>Live, and looked after</h3><p>Quick sites go live in days. You own the domain; we host it and keep your Google profile up to date if you'd like.</p></li>
        </ol>"""

def faq_html(items):
    return "".join(f"""
          <details class="faq__item"><summary>{e(q)}</summary><p>{e(a)}</p></details>""" for q, a in items)

def cta(hint, heading, line):
    return f"""
    <section class="cta" aria-labelledby="ctaTitle">
      <div class="container cta__inner reveal">
        <span class="cta__services">Websites · Google profiles · Hosting &amp; care</span>
        <h2 id="ctaTitle">{e(heading)}</h2>
        <p>{e(line)}</p>
        <div class="btn-row btn-row--center">
          <button type="button" class="btn btn--light btn--large" data-mockup-open data-mockup-hint="{e(hint)}">Get a free mockup</button>
          <a href="start?type=Website" class="btn btn--ghost-light btn--large">Start a Project</a>
        </div>
        <p class="small muted" data-contact-block hidden>Prefer to talk first? <a class="inline-link" href="#" data-contact="whatsapp" hidden>WhatsApp us</a></p>
      </div>
    </section>
"""

def city_page(c):
    url = f"{SITE}/website-design-{c['slug']}"
    faq = c["faq"] + COMMON_FAQ
    head = ld_head(url, c["title"], c["desc"], [("Home", SITE + "/"), ("Areas we serve", SITE + "/website-design-south-africa"), (c["city"], url)], faq,
                   service_ld(f"Website design in {c['city']}", url, {"@type": "City", "name": c["city"], "containedInPlace": {"@type": "AdministrativeArea", "name": c["province"]}}))
    searches = "".join(f'<span class="area-search">{PIN16}"{e(s)}"</span>' for s in c["searches"])
    inds = "".join(f"""
          <{'a' if l else 'div'} class="card{' card--link' if l else ''} reveal"{f' href="{l}"' if l else ''}><h3>{e(t)}</h3><p>{e(d)}</p>{'<div class="card__foot"><span class="card__more">See what we build</span></div>' if l else ''}</{'a' if l else 'div'}>""" for t, d, l in c["industries"])
    areas = ", ".join(e(a) for a in dict.fromkeys(c["areas"]))
    others = " · ".join(f'<a class="inline-link" href="website-design-{o["slug"]}">{e(o["city"])}</a>' for o in CITIES if o["slug"] != c["slug"])
    body = f"""
  <main id="main">

    <section class="page-head industry-head">
      <div class="container">
        <span class="eyebrow">Website design · {e(c['city'])}, {e(c['province'])}</span>
        <h1>{e(c['h1'])}</h1>
        <p class="lead">{e(c['lead'])}</p>
        <div class="btn-row" style="margin-top:1.4rem">
          <button type="button" class="btn btn--primary btn--large" data-mockup-open data-mockup-hint="{e(c['mockup_hint'])}">Get a free mockup of your site</button>
          <a href="#pricing" class="btn btn--ghost btn--large">See what it costs</a>
        </div>
        <p class="hero__freebie"><span class="hero__freebie-tag">Free</span> We build a preview of your site first: no deposit, no obligation. Websites from R1,000, with a fixed quote before you pay anything.</p>
      </div>
    </section>

    <section class="section" aria-labelledby="whyTitle">
      <div class="container service__grid">
        <div class="reveal">
          <span class="eyebrow">Why it matters in {e(c['city'])}</span>
          <h2 id="whyTitle">Your next customer is searching right now.</h2>
          <p class="lead" style="font-size:1.05rem">{e(c['why'])}</p>
        </div>
        <aside class="card card--tint reveal">
          <h3>What people in {e(c['city'])} type into Google</h3>
          <div class="area-searches">{searches}</div>
          <p class="small muted" style="margin-top:0.8rem">A website that names your area, plus a Google profile with the right service area, is how you show up for searches like these.</p>
        </aside>
      </div>
    </section>

    <section class="section section--tint" aria-labelledby="whoTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">Who we build for</span><h2 id="whoTitle">Websites for {e(c['city'])}'s small businesses.</h2></div>
        <div class="grid grid--2">{inds}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="howTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">Fully online</span><h2 id="howTitle">No office visits needed: it all happens on your phone.</h2></div>{remote_steps(f", wherever you are in {c['city']}")}
        <p class="small muted reveal" style="margin-top:1.2rem"><b>Areas we cover in and around {e(c['city'])}:</b> {areas}, and everywhere else in South Africa.</p>
      </div>
    </section>
{pricing_block()}
    <section class="section section--tint" aria-labelledby="faqTitle">
      <div class="container container--narrow">
        <div class="section__head reveal"><span class="eyebrow">Questions from {e(c['city'])}</span><h2 id="faqTitle">Straight answers.</h2></div>
        <div class="faq reveal">{faq_html(faq)}
        </div>
        <p class="small muted" style="margin-top:1.2rem">We also build for businesses in {others}, and <a class="inline-link" href="website-design-south-africa">everywhere else in South Africa</a>.</p>
      </div>
    </section>
{cta(c['mockup_hint'], f"See your {c['city']} business online before you pay a cent.", "Send us your business name and what you do. We'll send a free preview to your phone.")}
  </main>
"""
    return head, body

def hub_page():
    url = f"{SITE}/website-design-south-africa"
    faq = [("Do you really work with businesses anywhere in South Africa?", "Yes. Everything we do happens online: WhatsApp, email, a free mockup link on your phone, online quotes and card payments. Most clients never need a meeting, and if you'd like one, we do a quick video call."),
           ("Do you charge more if I'm far away?", "No. The prices are the same everywhere: websites from R1,000, hosting from R50 a month, with a fixed quote before you pay anything."),
           ("Will my site show up in my own town's searches?", "Yes. We name the areas you serve on your site and set up your Google Business Profile with the right service area. That's what local search results are built from, wherever you are."),
           ("How do I pay?", "You accept your fixed quote online and pay the R500 deposit by card (Yoco), or by EFT if you prefer. The balance is due when your site is finished.")]
    head = ld_head(url, "Website Design Anywhere in South Africa | Re-Charge", "Websites for small businesses anywhere in South Africa, from R1,000. Fully online: free mockup first, fixed quotes, card payments and WhatsApp support.",
                   [("Home", SITE + "/"), ("Areas we serve", url)], faq, service_ld("Website design in South Africa", url, {"@type": "Country", "name": "South Africa"}))
    city_slug = {c["city"]: c["slug"] for c in CITIES}
    provs = "".join(f"""
          <div class="card reveal area-prov"><h3>{PIN18} {e(p)}</h3><p>{' · '.join(f'<a class="inline-link" href="website-design-{city_slug[t]}">{e(t)}</a>' if t in city_slug else e(t) for t in towns)} and every town in between.</p></div>""" for p, towns in PROVINCES)
    body = f"""
  <main id="main">

    <section class="page-head industry-head">
      <div class="container">
        <span class="eyebrow">Areas we serve · all of South Africa</span>
        <h1>Websites for businesses anywhere in South Africa.</h1>
        <p class="lead">We work fully online, so where you are doesn't matter: a salon in Polokwane, a plumber in Gqeberha or a guesthouse in the Karoo gets the same free mockup, the same fixed prices and the same fast service.</p>
        <div class="btn-row" style="margin-top:1.4rem">
          <button type="button" class="btn btn--primary btn--large" data-mockup-open>Get a free mockup of your site</button>
          <a href="#pricing" class="btn btn--ghost btn--large">See what it costs</a>
        </div>
        <p class="hero__freebie"><span class="hero__freebie-tag">Free</span> We build a preview of your site first: no deposit, no obligation.</p>
      </div>
    </section>

    <section class="section" aria-labelledby="howTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">How it works from anywhere</span><h2 id="howTitle">No meetings, no travel. Just your phone.</h2></div>{remote_steps("")}
      </div>
    </section>

    <section class="section section--tint" aria-labelledby="provTitle">
      <div class="container">
        <div class="section__head reveal"><span class="eyebrow">Every province</span><h2 id="provTitle">From Musina to Cape Agulhas.</h2><p>Pick your city for local examples, or just <button type="button" class="inline-link" data-mockup-open>ask for your free mockup</button>: it works the same everywhere.</p></div>
        <div class="grid grid--3">{provs}
        </div>
      </div>
    </section>
{pricing_block()}
    <section class="section" aria-labelledby="faqTitle">
      <div class="container container--narrow">
        <div class="section__head reveal"><span class="eyebrow">Working remotely</span><h2 id="faqTitle">Straight answers.</h2></div>
        <div class="faq reveal">{faq_html(faq)}
        </div>
      </div>
    </section>
{cta("e.g. your business name, what you do and your town", "See your business online before you pay a cent.", "Wherever you are in South Africa: send us your business name and what you do, and we'll send a free preview to your phone.")}
  </main>
"""
    return head, body

PAGES = ["website-design-south-africa"] + [f"website-design-{c['slug']}" for c in CITIES]

if __name__ == "__main__":
    if "--list" in sys.argv:
        print(" ".join(PAGES)); sys.exit(0)
    out = [("website-design-south-africa", hub_page())] + [(f"website-design-{c['slug']}", city_page(c)) for c in CITIES]
    for name, (h, b) in out:
        open(f"src/{name}.body.head", "w").write(h)
        open(f"src/{name}.body", "w").write(b)
    print("wrote", len(out), "pages")
