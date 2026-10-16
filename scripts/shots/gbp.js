// Renders the Google Business Profile photos from scripts/shots/gbp.html into marketing/google-profile/.
// Serve the repo on 127.0.0.1:8199, then: node scripts/shots/gbp.js
const { chromium } = require('playwright');
const OUT = __dirname + '/../../marketing/google-profile/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await p.goto('http://127.0.0.1:8199/scripts/shots/gbp.html'); await p.waitForTimeout(2000);
  const ids = await p.$$eval('.f[id]', (els) => els.map((e) => e.id));
  for (const id of ids) {
    const name = id === 'logo' ? 'logo-720' : id === 'cover' ? 'cover-1280x720' : 'photos/' + id;
    await (await p.$('[id="' + id + '"]')).screenshot({ path: OUT + name + '.png' });
  }
  console.log('rendered', ids.length);
  await b.close();
})();
