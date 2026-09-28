// Ad cuts of the flow film, full HD, ending on a held call-to-action card.
//   NODE_PATH=/opt/node22/lib/node_modules node render-ad.js "$PWD" story|feed|wide [15]
// → ads/<mode>[-15]/0000.png… at 1.5× (story 1080×1920, feed 1080×1350, wide 1920×1080), 25 s at 30 fps.
// With "15": a 15-second cut — the three steps play ~1.7× faster, the "You're live" beat is
// skipped, and the end card holds for the last ~2.5 s.
const { chromium } = require('playwright'); const fs = require('fs');
const SIZES = { story: [720, 1280], feed: [720, 900], wide: [1280, 720] };
// [output time, film time] — straight lines between these points
const CUT15 = [[0, 0.3], [3, 4], [5.9, 9], [8.8, 14], [11.6, 18.8], [11.9, 21.6], [15, 24.7]];
const remap = (pts, t) => { for (let i = 1; i < pts.length; i++) { const [a, sa] = pts[i - 1], [b, sb] = pts[i]; if (t <= b) return sa + (sb - sa) * (t - a) / (b - a); } return pts[pts.length - 1][1]; };
(async () => { const dir = process.argv[2], mode = process.argv[3], short = process.argv[4] === '15'; const [w, h] = SIZES[mode];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  await p.goto('file://' + dir + '/film.html#' + (mode === 'wide' ? 'ad' : mode + ',ad')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const out = `${dir}/ads/${mode}${short ? '-15' : ''}`; fs.mkdirSync(out, { recursive: true });
  const fps = 30, dur = short ? 15 : 25;
  for (let i = 0; i < fps * dur; i++) { await p.evaluate((t) => window.render(t), short ? remap(CUT15, i / fps) : i / fps); await p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png` }); }
  await b.close(); })();
