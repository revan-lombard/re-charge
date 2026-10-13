// Social clips from social.html.
//   NODE_PATH=/opt/node22/lib/node_modules node render-social.js "$PWD" <email|question|invoice> <feed|story> [stills]
// → social/<episode>-<format>/0000.png… at 1.5× (feed 1080×1350, story 1080×1920), 30 fps.
// With "stills": only a handful of frames into social/stills/, to check the layout.
const { chromium } = require('playwright'); const fs = require('fs');
const SIZES = { feed: [720, 900], story: [720, 1280] };
(async () => {
  const [dir, ep, fmt, mode] = process.argv.slice(2); const [w, h] = SIZES[fmt];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  await p.goto(`file://${dir}/social.html#${ep},${fmt}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const dur = await p.evaluate(() => window.DURATION), fps = 30;
  if (mode === 'stills') {
    const out = `${dir}/social/stills`; fs.mkdirSync(out, { recursive: true });
    for (const t of [2, 6.5, 9, 13.9, 16, 19.5]) { await p.evaluate((x) => window.render(x), t); await p.screenshot({ path: `${out}/${ep}-${fmt}-${t}.png` }); }
  } else {
    const out = `${dir}/social/${ep}-${fmt}`; fs.mkdirSync(out, { recursive: true });
    for (let i = 0; i < fps * dur; i++) { await p.evaluate((x) => window.render(x), i / fps); await p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png` }); }
  }
  await b.close();
})();
