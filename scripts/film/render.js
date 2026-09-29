const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const mode = process.argv[3] || ''; const SIZE = { portrait: [720, 960], feed: [720, 900] }; const [vw, vh] = SIZE[mode] || [1280, 720]; const portrait = Boolean(SIZE[mode]); const p = await b.newPage({ viewport: { width: vw, height: vh } });
  await p.goto('file://' + process.argv[2] + '/film.html' + (portrait ? '#' + mode : '')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const dir = process.argv[2] + (mode === 'feed' ? '/framesH' : portrait ? '/framesP' : '/frames'); fs.mkdirSync(dir, { recursive: true });
  const fps = 30, dur = 24;
  for (let i = 0; i < fps * dur; i++) { await p.evaluate((t) => window.render(t), i / fps); await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.png` }); }
  await b.close(); })();
