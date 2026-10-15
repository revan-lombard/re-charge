// Re-captures the homepage "Watch it work" screenshots in the light skin.
// Serve the site on 127.0.0.1:8199, then: node scripts/shots/capture.js scripts/shots assets/shots
const { chromium } = require('playwright'); const fs=require('fs');
const css=fs.readFileSync(process.argv[2]+'/light.css','utf8'); const out=process.argv[3];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 680 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
  const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem('rc_consent', 'no'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:8199/live-demo.html?sample=email', { waitUntil: 'load' }); await pg.addStyleTag({content:css}); await pg.waitForTimeout(900);
  await pg.evaluate(() => { document.getElementById('consent')?.remove(); document.body.classList.remove('consent-open'); });
  await pg.locator('.ld-box').screenshot({ path: out+'/inbox-before.png' });
  await pg.click('[data-ld-run]'); await pg.waitForTimeout(900);
  await pg.locator('.ld-box').screenshot({ path: out+'/inbox-after.png' });
  const k = await pg.locator('.ld-kpis').boundingBox(), t = await pg.locator('.ld-time').boundingBox();
  await pg.screenshot({ path: out+'/inbox-results.png', clip: { x: k.x - 12, y: k.y - 12, width: Math.max(k.width, t.width) + 24, height: (t.y + t.height) - k.y + 24 } });
  await pg.screenshot({ path: out+'/full.png' });
  await b.close(); })();
