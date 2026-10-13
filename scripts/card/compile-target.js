// Compiles the card's back (assets/ar/card-back.png) into the MindAR target file the AR page
// tracks (assets/ar/card.mind). Run after render.js whenever the back of the card changes.
//   NODE_PATH=/opt/node22/lib/node_modules node compile-target.js <dir with node_modules/mind-ar>
// (npm install --ignore-scripts mind-ar@1.2.5 three@0.149.0 in any scratch folder; nothing is committed.)
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
(async () => {
  const mods = path.resolve(process.argv[2] || '.', 'node_modules');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  p.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text().slice(0, 200)); });
  await p.route('http://ar.local/**', (r) => {
    const u = new URL(r.request().url()).pathname;
    if (u === '/') return r.fulfill({ contentType: 'text/html', body: `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><script type="module">
      import { Compiler } from '/mind-ar/dist/mindar-image.prod.js';
      window.compile = async () => {
        const img = new Image(); img.src = '/card-back.png'; await img.decode();
        const c = new Compiler(); await c.compileImageTargets([img], (p) => { window.progress = p; });
        const buf = await c.exportData(); return Array.from(new Uint8Array(buf));
      }; window.ready = true;</script>` });
    if (u === '/card-back.png') return r.fulfill({ path: path.join(ROOT, 'assets/ar/card-back.png') });
    const f = path.join(mods, u); return fs.existsSync(f) ? r.fulfill({ path: f, contentType: 'application/javascript' }) : r.fulfill({ status: 404 });
  });
  await p.goto('http://ar.local/'); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const bytes = await p.evaluate(() => window.compile());
  fs.writeFileSync(path.join(ROOT, 'assets/ar/card.mind'), Buffer.from(bytes));
  console.log('card.mind', bytes.length, 'bytes');
  await b.close();
})();
