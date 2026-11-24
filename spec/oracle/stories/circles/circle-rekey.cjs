// profiles/rekeys.md, for a circle: a rekey is a key grant signed `as` the circle, where a row holds for it; circle_key reads those.
const L = require('./lib.cjs'); const { fb, World, P, T, nm, A, check, done, found, GBP, part, as, confirm, readCodes, sha, r1 } = L;
const hex = s => sha(s); // a 32-byte value in hex stands for a key
// a rekey's `epoch` and `keys` are declared by the profile's schema, named by the block, as anyone's fields are (a profile adds no field)
const rekeySchema = (who) => T(who.write('thing', { kind: 'schema', name: 'rekey', target: 'grant.key', fields: { epoch: 'a whole number', keys: 'the encryption keys, sealed' } }), 'S');
{
  const w = new World(), amara = P(w, 'amara'), leila = P(w, 'leila'), till = P(w, 'till');
  const F = T(amara.write('actor', { kind: 'circle', name: 'cafe', pack: part(100), rules: [{ parts: 50, scope: { types: ['grant'] } }], public_key_encrypt: hex('epoch0') }, { meter: till.id }), 'F');
  const P1 = L.sendParts(amara, F, 50, leila); L.yesTo(leila, P1);
  const S = rekeySchema(amara);
  const rk = (who, n, k, after, extra = {}) => as(who, F, 'grant', { kind: 'key', epoch: n, public_key_encrypt: hex(k), keys: [hex('sealed-' + k)] }, { subject: F.hash, schema: S.hash, after: [after], ...extra });
  const R1 = T(rk(amara, 1, 'epoch1', F.hash), 'R1');
  check('rekey', 'epoch 0 is the circle actor\'s own key; a rekey by one hand of 50 parts, where the row needs 50 parts of grant words: holds (Amara\'s 50)', [fb.door('circle_key', F.hash, w.blocks).epoch, fb.door('circle_key', F.hash, w.blocks).keys], [1, [hex('epoch1')]]);
  const R2 = T(rk(leila, 2, 'epoch2', R1.hash), 'R2');
  check('rekey', 'Leila\'s epoch 2 (50 parts, the row\'s 50): holds; the circle is at epoch 2', fb.door('circle_key', F.hash, w.blocks).epoch, 2);
  const w2 = new World(), a2 = P(w2, 'amara'), l2 = P(w2, 'leila'), st = P(w2, 'stranger'), t2 = P(w2, 'till');
  const F2 = T(a2.write('actor', { kind: 'circle', name: 'cafe', pack: part(100), rules: [{ parts: 1, scope: { types: ['grant'] } }], public_key_encrypt: hex('epoch0') }, { meter: t2.id }), 'F2');
  const bad = T(as(st, F2, 'grant', { kind: 'key', epoch: 1, public_key_encrypt: hex('evil'), keys: [hex('sealed-evil')] }, { subject: F2.hash, schema: rekeySchema(a2).hash, after: [F2.hash] }), 'BAD');
  check('rekey', 'a stranger who owns no part signs a rekey `as` the circle: no row holds, it counts for nothing: still epoch 0', fb.door('circle_key', F2.hash, w2.blocks).epoch, 0);
}
done();
