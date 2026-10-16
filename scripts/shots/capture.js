// Desktop versions of the homepage "Watch it work" before/after pair, in the light skin. The two are
// the same size and their columns line up (a fixed-width labels column in both states), so the
// slider shows each row half before, half after. Serve the site on 127.0.0.1:8199, then:
// node scripts/shots/capture.js <out-dir>, and convert each PNG:
// convert inbox-before.png -resize 1862x -quality 84 assets/shots/inbox-before.webp (same for after).
// Phone versions: scripts/shots/capture-cmp.js.
const { chromium } = require('playwright'); const fs = require('fs');
const css = fs.readFileSync(__dirname + '/light.css', 'utf8') +
  '.ld[data-kind="email"] .ld-row__head{grid-template-columns:.6rem minmax(0,9rem) minmax(0,1fr) 21rem!important}.ld[data-kind="email"] .ld-row__time{display:none!important}';
const out = process.argv[2];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 680 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
  const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem('rc_consent', 'no'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:8199/live-demo.html?sample=email', { waitUntil: 'load' }); await pg.addStyleTag({ content: css }); await pg.waitForTimeout(900);
  // no header note: "tap any to see it" isn't true on the homepage (a tap moves the slider), and the After tag sits there
  const basis = () => pg.evaluate(() => { document.getElementById('consent')?.remove(); document.body.classList.remove('consent-open'); const el = document.querySelector('[data-ld-basis]'); if (el) el.textContent = ''; });
  await basis();
  await pg.locator('.ld-box').screenshot({ path: out + '/inbox-before.png' });
  await pg.click('[data-ld-run]'); await pg.waitForTimeout(900);
  await basis(); await pg.evaluate(() => { const r = document.querySelector('.ld-rows'); if (r) r.scrollTop = 0; });
  await pg.locator('.ld-box').screenshot({ path: out + '/inbox-after.png' });
  await b.close(); })();
