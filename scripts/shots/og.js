// Renders og-image.png (1200x630) from scripts/shots/og.html. Serve the repo on 127.0.0.1:8199, then:
// node scripts/shots/og.js <out-dir>
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('http://127.0.0.1:8199/scripts/shots/og.html'); await p.waitForTimeout(1800);
  await p.screenshot({ path: (process.argv[2] || '.') + '/og-image.png' });
  await b.close();
})();
