#!/usr/bin/env node
// Mockup builder ↔ GitHub queue (see supabase/functions/_shared/buildqueue.ts).
//
//   node scripts/build_queue.js list --key <private.pem>
//       → prints the decrypted briefs in _build/queue/ as a JSON array
//   node scripts/build_queue.js done --slug <slug> --status built|failed \
//        [--url URL] [--commit SHA] [--files a,b] [--bytes N] [--notes "..."]
//       → writes _build/results/<slug>.json and removes _build/queue/<slug>.json
//
// No dependencies. Never prints the private key.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const QUEUE = path.join(ROOT, '_build', 'queue'); const RESULTS = path.join(ROOT, '_build', 'results');
const args = process.argv.slice(2); const cmd = args[0];
const opt = (k, d = '') => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const die = (m) => { console.error(m); process.exit(1); };

function decrypt(obj, keyPem) {
  if (obj.v !== 1 || obj.alg !== 'RSA-OAEP-256+A256GCM') throw new Error('unknown brief format');
  const aes = crypto.privateDecrypt({ key: keyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(obj.key, 'base64'));
  const buf = Buffer.from(obj.data, 'base64'); const tag = buf.subarray(buf.length - 16); const ct = buf.subarray(0, buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', aes, Buffer.from(obj.iv, 'base64')); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

if (cmd === 'list') {
  const keyFile = opt('key') || process.env.BUILD_KEY_FILE; if (!keyFile) die('--key <private.pem> is required');
  const keyPem = fs.readFileSync(keyFile, 'utf8');
  const files = fs.existsSync(QUEUE) ? fs.readdirSync(QUEUE).filter((f) => f.endsWith('.json')).sort() : [];
  const briefs = []; const bad = [];
  for (const f of files) {
    try { const b = decrypt(JSON.parse(fs.readFileSync(path.join(QUEUE, f), 'utf8')), keyPem); b.slug = b.slug || f.replace(/\.json$/, ''); briefs.push(b); }
    catch (e) { bad.push(`${f}: ${e.message}`); }
  }
  if (bad.length) console.error('could not read: ' + bad.join('; '));
  process.stdout.write(JSON.stringify(briefs.slice(0, 3), null, 2) + '\n');
} else if (cmd === 'done') {
  const slug = opt('slug'); const status = opt('status');
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) die('--slug is required (lowercase letters, numbers, dashes)');
  if (!['built', 'failed'].includes(status)) die('--status must be built or failed');
  fs.mkdirSync(RESULTS, { recursive: true });
  const result = { v: 1, slug, status, url: opt('url') || null, commit: opt('commit') || null,
    files: opt('files').split(',').map((s) => s.trim()).filter(Boolean), bytes: Number(opt('bytes', '0')) || 0,
    notes: opt('notes').slice(0, 4000), at: new Date().toISOString() };
  fs.writeFileSync(path.join(RESULTS, slug + '.json'), JSON.stringify(result, null, 2) + '\n');
  const q = path.join(QUEUE, slug + '.json'); if (fs.existsSync(q)) fs.unlinkSync(q);
  console.log(`recorded ${status} for ${slug}`);
} else {
  die('usage: build_queue.js list --key <pem> | done --slug <slug> --status built|failed [...]');
}
