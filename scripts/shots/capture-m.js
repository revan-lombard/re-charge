// Phone versions of the homepage "Watch it work" shots. Serve the site on 127.0.0.1:8199, then:
// node scripts/shots/capture-m.js <out-dir>, and convert each PNG: convert x-m.png -quality 82 assets/shots/x-m.webp
const { chromium } = require('playwright'); const fs = require('fs');
const css = fs.readFileSync(__dirname + '/light.css', 'utf8'); const out = process.argv[2];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem('rc-consent', 'denied'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:8199/live-demo.html?sample=email', { waitUntil: 'load' }); await pg.addStyleTag({ content: css }); await pg.waitForTimeout(900);
  await pg.evaluate(() => { document.getElementById('consent')?.remove(); document.body.classList.remove('consent-open'); });
  await pg.locator('.ld-box').screenshot({ path: out + '/inbox-before-m.png' });
  await pg.click('[data-ld-run]'); await pg.waitForTimeout(400); await pg.click('[data-ld-run]'); await pg.waitForTimeout(900);
  await pg.locator('.ld-box').screenshot({ path: out + '/inbox-after-m.png' });
  const k = await pg.locator('.ld-kpis').boundingBox(), t = await pg.locator('.ld-time').boundingBox();
  await pg.screenshot({ path: out + '/inbox-results-m.png', clip: { x: k.x - 6, y: k.y - 6, width: Math.max(k.width, t.width) + 12, height: (t.y + t.height) - k.y + 12 } });
  await b.close(); })();
