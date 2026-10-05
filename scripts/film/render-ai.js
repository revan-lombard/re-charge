// Renders ai-film.html frame by frame. Two vertical cuts: the 4:5 desktop hero
// and the 3:4 phone cut. See README.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const dir0 = process.argv[2], mode = process.argv[3] || 'hero';
  // Drawn at the size it is actually shown on the page and rendered at 2x, so the
  // chat text lands at the same pixel size a reader sees rather than being
  // shrunk twice. One 4:5 cut serves desktop and phone.
  const [vw, vh] = [396, 495];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  await p.goto('file://' + dir0 + '/ai-film.html#' + mode);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const dir = `${dir0}/framesAI-${mode}`; fs.mkdirSync(dir, { recursive: true });
  const fps = 30, dur = 24;
  for (let i = 0; i < fps * dur; i++) {
    await p.evaluate((t) => window.render(t), i / fps);
    await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.png` });
  }
  await b.close();
  console.log(mode, 'rendered', fps * dur, 'frames to', dir);
})();
