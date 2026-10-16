// Renders the phone images for the industry pages from scripts/shots/phones.html.
// Serve the repo on 127.0.0.1:8199, then: node scripts/shots/phones.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1800, height: 1500 }, deviceScaleFactor: 3 });
  await p.goto('http://127.0.0.1:8199/scripts/shots/phones.html'); await p.waitForTimeout(1500);
  for (const id of ['phone-chat', 'phone-call', 'phone-restaurant', 'phone-clean', 'phone-accounts']) {
    const el = await p.$('#' + id); const bx = await el.boundingBox();
    await p.screenshot({ path: process.argv[2] + '/' + id + '.png', omitBackground: true, clip: { x: bx.x - 30, y: bx.y - 10, width: bx.width + 60, height: bx.height + 60 } });
  }
  await b.close();
})();
