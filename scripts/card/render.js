// Prints card.html: each side as a print PDF (96 × 61 mm with 3 mm bleed) and a 300-dpi PNG.
//   NODE_PATH=/opt/node22/lib/node_modules node render.js
// → marketing/business-card/re-charge-card-{front,back}.pdf|png
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'marketing/business-card');
const MM = 96 / 25.4;                     // CSS px per mm
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const side of ['front', 'back']) {
    const url = 'file://' + path.join(__dirname, 'card.html') + '#' + side;
    const p = await b.newPage({ viewport: { width: Math.round(96 * MM), height: Math.round(61 * MM) }, deviceScaleFactor: 300 / 96 });
    await p.goto(url); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.pdf({ path: path.join(OUT, `re-charge-card-${side}.pdf`), width: '96mm', height: '61mm', printBackground: true });
    await p.screenshot({ path: path.join(OUT, `re-charge-card-${side}.png`) });
    await p.close();
  }
  await b.close();
})();
