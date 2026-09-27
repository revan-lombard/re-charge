#!/usr/bin/env node
// Make a new key pair for the mockup builder (run on your own computer).
//   node scripts/make_build_key.js [path-for-private-key]
// - writes the PRIVATE key to the path given (default: one folder above the
//   repo, so it can never be committed) — paste its whole contents into the
//   KEY section of the "Re-Charge: build queued mockups" Routine;
// - writes the PUBLIC key into supabase/functions/_shared/build_pubkey.ts —
//   commit that, then: supabase functions deploy build-sync project-intake
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, '..', 'rc_build_key.pem'));
if (out.startsWith(root + path.sep)) { console.error('Refusing to write the private key inside the repository.'); process.exit(1); }
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
fs.writeFileSync(out, privateKey, { mode: 0o600 });
const ts = path.join(root, 'supabase', 'functions', '_shared', 'build_pubkey.ts');
const head = fs.readFileSync(ts, 'utf8').split('export const')[0];
fs.writeFileSync(ts, head + 'export const BUILD_PUBLIC_KEY = `' + publicKey.trim() + '\n`;\n');
const fp = crypto.createHash('sha256').update(crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
console.log('Private key written to: ' + out + '   (keep it private; paste it into the Routine, then you can delete it)');
console.log('Public key written to:  ' + path.relative(root, ts) + '   fingerprint ' + fp);
