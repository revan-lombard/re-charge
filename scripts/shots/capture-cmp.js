// Phone versions of the homepage "Watch it work" before/after pair, the same size so the slider lines
// them up row for row. Serve the site on 127.0.0.1:8199, then: node scripts/shots/capture-cmp.js <out-dir>
// and convert each PNG: convert inbox-before-m.png -quality 82 assets/shots/inbox-before-m.webp (same for after).
// The desktop pair: scripts/shots/capture.js.
const { chromium } = require('playwright'); const fs = require('fs');
const css = fs.readFileSync(__dirname + '/light.css', 'utf8') + '.ld-box{height:452px!important;min-height:0!important;max-height:none!important}';
const out = process.argv[2];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem('rc-consent', 'denied'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:8199/live-demo.html?sample=email', { waitUntil: 'load' }); await pg.addStyleTag({ content: css }); await pg.waitForTimeout(900);
  // no header note: "tap any to see it" isn't true on the homepage (a tap moves the slider), and the After tag sits there
  const basis = () => pg.evaluate(() => { document.getElementById('consent')?.remove(); document.body.classList.remove('consent-open'); const el = document.querySelector('[data-ld-basis]'); if (el) el.textContent = ''; });
  await basis();
  await pg.locator('.ld-box').screenshot({ path: out + '/inbox-before-m.png' });
  await pg.click('[data-ld-run]'); await pg.waitForTimeout(400); await pg.click('[data-ld-run]'); await pg.waitForTimeout(900);
  // back to the top, and hide the results panel so nothing dark shows behind the box's rounded corners
  await basis();
  await pg.evaluate(() => { const r = document.querySelector('.ld-rows'); if (r) r.scrollTop = 0; document.querySelectorAll('.ld-kpis, .ld-time').forEach((e) => { e.style.visibility = 'hidden'; }); });
  await pg.locator('.ld-box').screenshot({ path: out + '/inbox-after-m.png' });
  await b.close(); })();
