const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
// A suite move only by a voice above; a hidden voice has no suite. World: (1) Harry H0, list [card (key_hash), phone P]. (2) A forger with P's broken key signs F1: a key grant from P putting a new key of another suite in P's place.
// Expect F1 is no suite move; Harry's list unchanged. (3) Harry's card signs C1, the same move. Expect C1 is the move.
// (The phone key is an ordinary key here and the new key an SM2 key; a reader's belief in a suite is not an argument of the door, so only the believing half is built.)
const sm = fb.door('keypair', '5a'.repeat(32), 'sm');
{
  const w = new World(), harry = P(w, 'harry'), pK = mkKey('harry-phone');
  const hashVoice = { key_hash: fb.door('key_hash', harry.key.pub) };
  const K1 = harry.write('grant', { kind: 'key', voices: [hashVoice, { key: pK.pub, wait: 'PT0S' }] }, { subject: harry.id, updates: harry.id });
  const phone = harry.asKey(pK, K1.hash);
  const move = { kind: 'key', voices: [hashVoice, { key: sm.public_key_sign, suite: 'sm', wait: 'PT0S' }] };
  const F1 = T(phone.write('grant', move, { subject: harry.id, updates: K1.hash }), 'F1');
  const voicesNow = () => fb.door('identity_state', harry.id, w.blocks).voices.map(v => v.key ? v.key.slice(-6) + ':' + (v.suite || 'std') : 'hash');
  check('suite move', 'F1 (from P itself) is no suite move: it never stands', std(w, F1), [false, []]);
  check('suite move', 'Harry\'s list is unchanged: [card by hash, P]', voicesNow(), ['hash', pK.pub.slice(-6) + ':std']);
  const C1 = T(harry.write('grant', move, { subject: harry.id, updates: K1.hash }), 'C1');
  check('suite move', 'C1 (from the card, above P) is the move: it stands', std(w, C1), [true, []]);
  check('suite move', 'the list now holds the SM2 key in P\'s place', voicesNow(), ['hash', sm.public_key_sign.slice(-6) + ':sm']);
  check('suite move', 'a hidden voice states no suite: {key_hash, suite} is a shape error', fb.door('read', harry.make('grant', { kind: 'key', voices: [{ key_hash: fb.door('key_hash', harry.key.pub), suite: 'std' }] }, { subject: harry.id, updates: K1.hash }), w.blocks).map(x => x.code), ['shape']);
}
done();
