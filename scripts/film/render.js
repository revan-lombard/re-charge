const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const portrait = process.argv[3] === 'portrait'; const p = await b.newPage({ viewport: portrait ? { width: 720, height: 960 } : { width: 1280, height: 720 } });
  await p.goto('file://' + process.argv[2] + '/film.html' + (portrait ? '#portrait' : '')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const dir = process.argv[2] + (portrait ? '/framesP' : '/frames'); fs.mkdirSync(dir, { recursive: true });
  const fps = 30, dur = 24;
  for (let i = 0; i < fps * dur; i++) { await p.evaluate((t) => window.render(t), i / fps); await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.png` }); }
  await b.close(); })();
