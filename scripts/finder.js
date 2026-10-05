#!/usr/bin/env node
// Prospect finder ↔ GitHub (see supabase/functions/_shared/finder.ts).
//
//   node scripts/finder.js config
//       → prints _build/finder/config.json (what to look for)
//   node scripts/finder.js plan [--n 10]
//       → prints the next n "type in area" searches to do, working through every
//         area × type combination over the weeks (progress in _build/finder/progress.json).
//         Each run of searches mixes all the business types across different areas. With
//         "nationwide": true in the config, the towns in NATIONWIDE are mixed in with your own areas.
//   node scripts/finder.js pack --in /tmp/found.json [--searched "salons in Edenvale, …"]
//       → checks the finds, encrypts them with _build/finder/pubkey.pem and writes
//         _build/finder/results/<date>-<random>.json (commit that file)
//
// found.json is an array of businesses:
//   { business, type, location, phone, email, website, website_note, google_url,
//     review_count, rating, activity, active_recently, potential, opportunity, why, source_url, contact_name,
//     ai_signal, ai_potential, size_hint }
// No dependencies.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'); const DIR = path.join(ROOT, '_build', 'finder');
const args = process.argv.slice(2); const cmd = args[0];
const opt = (k, d = '') => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const die = (m) => { console.error(m); process.exit(1); };
const POT = ['very_high', 'high', 'medium', 'low'];
// Main towns and cities in all nine provinces, listed a province at a time so consecutive searches
// land in different parts of the country. Re-Charge works fully online, so distance doesn't matter.
const NATIONWIDE = [
  'Johannesburg', 'Cape Town', 'Durban', 'Gqeberha', 'Bloemfontein', 'Polokwane', 'Mbombela (Nelspruit)', 'Rustenburg', 'Kimberley',
  'Pretoria', 'Bellville, Cape Town', 'Pietermaritzburg', 'East London', 'Welkom', 'Tzaneen', 'eMalahleni (Witbank)', 'Klerksdorp', 'Upington',
  'Soweto', 'Stellenbosch', 'Richards Bay', 'Mthatha', 'Bethlehem', 'Mokopane', 'Middelburg, Mpumalanga', 'Potchefstroom', 'Kuruman',
  'Centurion', 'Paarl', 'Newcastle', 'Makhanda', 'Kroonstad', 'Thohoyandou', 'Secunda', 'Mahikeng', 'Springbok',
  'Benoni', 'George', 'Ballito', 'Jeffreys Bay', 'Sasolburg', 'Makhado (Louis Trichardt)', 'Ermelo', 'Brits',
  'Boksburg', 'Mossel Bay', 'Port Shepstone', 'Komani (Queenstown)', 'Midrand', 'Worcester', 'Ladysmith', 'Krugersdorp',
  'Germiston', 'Knysna', 'Umhlanga', 'Roodepoort', 'Vereeniging', 'Vanderbijlpark', 'Springs', 'Kempton Park',
];
// Every area × type pair once, ordered so each block of types.length searches covers every type,
// each in a different area: pair k → type k % T, area (floor(k / T) + type) % A.
function searchGrid(cfg) {
  const own = cfg.areas || [], nat = cfg.nationwide ? NATIONWIDE : [], mixed = [];
  for (let i = 0; i < Math.max(own.length, nat.length); i++) { if (i < own.length) mixed.push(own[i]); if (i < nat.length) mixed.push(nat[i]); }   // your areas alternate with the national ones
  const seen = new Set(), areas = [];
  for (const a of mixed) { const k = a.toLowerCase().trim(); if (k && !seen.has(k)) { seen.add(k); areas.push(a.trim()); } }
  const types = cfg.types || [], T = types.length, A = areas.length, grid = [];
  for (let k = 0; k < A * T; k++) { const t = k % T; grid.push(`${types[t]} in ${areas[(Math.floor(k / T) + t) % A]}`); }
  return grid;
}

if (cmd === 'config') {
  const f = path.join(DIR, 'config.json');
  if (!fs.existsSync(f)) die('No _build/finder/config.json yet: the finder has not been set up in the panel (Settings → Prospect finder).');
  process.stdout.write(fs.readFileSync(f, 'utf8'));
} else if (cmd === 'plan') {
  const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
  const grid = searchGrid(cfg);
  if (!grid.length) die('config has no areas or types');
  const pf = path.join(DIR, 'progress.json');
  let prog = { cursor: 0 }; try { prog = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch (e) { /* first run */ }
  const n = Math.max(1, Math.min(grid.length, Number(opt('n', '10')) || 10));
  const start = (prog.cursor || 0) % grid.length, plan = [];
  for (let i = 0; i < n; i++) plan.push(grid[(start + i) % grid.length]);
  fs.writeFileSync(pf, JSON.stringify({ cursor: (start + n) % grid.length, of: grid.length, updatedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(plan.join('\n'));
  if (cfg.focus && cfg.focus !== 'both') console.error(`(focus: ${cfg.focus} — weigh the evidence for that first)`);
  console.error(`(${n} of ${grid.length} combinations; the rest follow in later weeks)`);
} else if (cmd === 'pack') {
  const keyFile = path.join(DIR, 'pubkey.pem');
  if (!fs.existsSync(keyFile)) die('No _build/finder/pubkey.pem yet: set the finder up in the panel first.');
  let found; try { found = JSON.parse(fs.readFileSync(opt('in'), 'utf8')); } catch (e) { die('--in must be a JSON array of businesses: ' + e.message); }
  if (!Array.isArray(found)) die('--in must be a JSON array');
  const problems = [];
  found = found.filter((r, i) => {
    if (!r || typeof r.business !== 'string' || !r.business.trim()) { problems.push(`#${i + 1}: no business name`); return false; }
    if (!r.phone && !r.email && !r.source_url) { problems.push(`${r.business}: no phone, email or source link`); return false; }
    if (r.potential && !POT.includes(r.potential)) r.potential = null;
    if (r.ai_potential && !POT.includes(r.ai_potential)) r.ai_potential = null;
    return true;
  });
  if (problems.length) console.error('skipped: ' + problems.join('; '));
  if (!found.length) die('nothing to pack');
  const plain = JSON.stringify({ v: 1, searched: opt('searched'), at: new Date().toISOString(), found });
  const aesKey = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]);   // ciphertext || tag (WebCrypto layout)
  const key = crypto.publicEncrypt({ key: fs.readFileSync(keyFile, 'utf8'), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey);
  const out = path.join(DIR, 'results', `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ v: 1, alg: 'RSA-OAEP-256+A256GCM', key: key.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') }) + '\n');
  console.log(`packed ${found.length} businesses → ${path.relative(ROOT, out)}`);
} else {
  die('usage: finder.js config | pack --in found.json [--searched "…"]');
}
