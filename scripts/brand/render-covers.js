// Renders covers.html: og-image.png (link previews) and the social covers in marketing/covers/.
//   NODE_PATH=/opt/node22/lib/node_modules node scripts/brand/render-covers.js
const { chromium } = require('playwright'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = { og: 'og-image.png', facebook: 'marketing/covers/facebook-cover-1640x624.png', linkedin: 'marketing/covers/linkedin-cover-1128x191.png', x: 'marketing/covers/x-header-1500x500.png', google: 'marketing/covers/google-profile-cover-1280x720.png' };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [k, file] of Object.entries(OUT)) {
    const p = await b.newPage({ viewport: { width: 1700, height: 800 } });
    await p.goto('file://' + path.join(__dirname, 'covers.html') + '#' + k); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.locator('#c').screenshot({ path: path.join(ROOT, file) });
    await p.close();
  }
  await b.close();
})();
