// Ad cuts of the flow film, full HD, ending on a held call-to-action card.
//   NODE_PATH=/opt/node22/lib/node_modules node render-ad.js "$PWD" story|feed|wide
// → ads/<mode>/0000.png… at 1.5× (story 1080×1920, feed 1080×1350, wide 1920×1080), 25 s at 30 fps.
const { chromium } = require('playwright'); const fs = require('fs');
const SIZES = { story: [720, 1280], feed: [720, 900], wide: [1280, 720] };
(async () => { const dir = process.argv[2], mode = process.argv[3]; const [w, h] = SIZES[mode];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  await p.goto('file://' + dir + '/film.html#' + (mode === 'wide' ? 'ad' : mode + ',ad')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const out = `${dir}/ads/${mode}`; fs.mkdirSync(out, { recursive: true });
  const fps = 30, dur = 25;
  for (let i = 0; i < fps * dur; i++) { await p.evaluate((t) => window.render(t), i / fps); await p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png` }); }
  await b.close(); })();
