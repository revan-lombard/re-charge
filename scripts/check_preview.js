// Opens a preview folder in Chromium at phone + desktop widths and fails on
// horizontal overflow, console errors or a missing index.html.
//   node scripts/check_preview.js previews/<slug>
const path = require('path'); const fs = require('fs');
const dir = process.argv[2]; if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('usage: node scripts/check_preview.js previews/<slug>  (needs index.html)'); process.exit(2); }
let chromium; try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { console.error('playwright not found; npm i -g playwright or set NODE_PATH'); process.exit(2); } }
(async () => {
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const shots = path.join(dir, '_shots'); fs.mkdirSync(shots, { recursive: true });
  let bad = 0;
  for (const [w, h, tag] of [[390, 844, 'mobile'], [1440, 900, 'desktop']]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|CERT|net::/.test(m.text())) errs.push(m.text()); });
    await page.goto('file://' + path.resolve(dir, 'index.html'), { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const noindex = await page.evaluate(() => !!document.querySelector('meta[name="robots"][content*="noindex"]'));
    await page.screenshot({ path: path.join(shots, `${tag}.png`), fullPage: true });
    const ok = ov <= 0 && errs.length === 0 && noindex; if (!ok) bad++;
    console.log(`${tag}: overflow=${ov}px errors=${errs.length} noindex=${noindex} → ${ok ? 'OK' : 'FAIL'}${errs.length ? '\n  ' + errs.join('\n  ') : ''}`);
  }
  await browser.close();
  console.log(bad ? 'FAILED — fix before pushing' : 'PASS');
  process.exit(bad ? 1 : 0);
})();
