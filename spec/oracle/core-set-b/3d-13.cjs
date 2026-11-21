const L = require('./lib.cjs'); const { fb, World, check, done, sha, cj, day, headerOf } = L;
const crypto = require('crypto');
// 3d-13 A passkey signature counts only when the user was verified. World: (1) Mama M0 with card A as a passkey voice. (2) Card A signs M1 with flags 0x01: bad_signature. (3) The same with flags 0x05: valid.
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spki = '3059301306072a8648ce3d020106082a8648ce3d030107034200' + ec.publicKey.export({ format: 'der', type: 'spki' }).subarray(26).toString('hex');
const N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
const frame = (bytes, flags) => {
  const chal = crypto.createHash('sha256').update(bytes).digest('base64url');
  const cdj = Buffer.from('{"type":"webauthn.get","challenge":"' + chal + '","origin":"https://example.org"}', 'utf8');
  const auth = Buffer.alloc(37); auth[32] = flags;
  const der = crypto.sign('sha256', Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]), ec.privateKey);
  let i = 4, rl = der[3], r = der.subarray(i, i + rl); i += rl + 2; const sl = der[i - 1]; let s = der.subarray(i, i + sl);
  const strip = v => { while (v.length > 32 && v[0] === 0) v = v.subarray(1); return Buffer.concat([Buffer.alloc(32 - v.length), v]); };
  r = strip(r); s = strip(s); let sn = BigInt('0x' + s.toString('hex')); if (sn > N / 2n) sn = N - sn;
  const len = Buffer.alloc(2); len.writeUInt16BE(auth.length);
  return Buffer.concat([r, Buffer.from(sn.toString(16).padStart(64, '0'), 'hex'), len, auth, cdj]).toString('hex');
};
const gen = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', suite: 'p256', public_key_sign: spki }, refs: {} };
const gh = sha(cj(gen));
const m0 = { hash: gh, ...gen, signature: frame(Buffer.from(cj(gen), 'utf8'), 5) };
const blk = { type: 'thing', state: { name: 'a sale', at: day(0), audience: 'public', seq: 1 }, refs: { author: gh, prev: gh } };
const bh = sha(cj(blk)), hbytes = Buffer.from(cj(headerOf(blk, bh)), 'utf8');
const codes = r => r.map(x => x.code);
check('3d-13', 'M0 (genesis) signed with flags 0x05: valid', codes(fb.door('valid', m0, [])), []);
check('3d-13', 'M1 signed with flags 0x01 (present, not verified): bad_signature', codes(fb.door('valid', { hash: bh, ...blk, signature: frame(hbytes, 1) }, [m0])), ['bad_signature']);
check('3d-13', 'M1 signed with flags 0x05: valid', codes(fb.door('valid', { hash: bh, ...blk, signature: frame(hbytes, 5) }, [m0])), []);
check('3d-13', 'flags 0x04 (verified, not present) is no signature either', codes(fb.door('valid', { hash: bh, ...blk, signature: frame(hbytes, 4) }, [m0])), ['bad_signature']);
done();
