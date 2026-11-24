// A key named by hash in her genesis list speaks (core.md, section 5, `refs.key`; identity.md, A hidden voice). Ruth's genesis states her list:
// a hidden top key T (by its hash) above her card K. T shows itself by a key grant that names the genesis in refs.key: it stands. A key whose
// hash is not in the list cannot show itself so (`bad_signature`). T's next block names the grant that showed it, and speaks in T's place.
const L = require('../kit.cjs'); const { fb, World, P, check, done, day, mkKey, sha, cj, signRaw, codes } = L;
const w = new World(), wanjiru = P(w, 'wanjiru-clock');
const T = mkKey('ruth-top'), K = mkKey('ruth-card'), X = mkKey('not-in-her-list');
const voices = [{ key_hash: fb.door('key_hash', T.pub) }, { key: K.pub }];
const clocks = { names: [wanjiru.id], needed: 1 };
const g = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: K.pub, voices, clocks }, refs: {} };
const ruth = sha(cj(g)); w.add({ hash: ruth, ...g, signature: signRaw(K, cj(g)) });
const card = new L.Signer(w, ruth, K, undefined, ruth);
const top = card.asKey(T, ruth, ruth);
const show = top.write('grant', { kind: 'key', shown_key: T.pub, voices: [{ key: T.pub }, { key: K.pub }], clocks }, { subject: ruth, updates: ruth, key: ruth });
check('hidden key', 'T shows itself by a key grant naming her genesis in refs.key: valid, and it stands', [codes(fb.door('valid', show, w.blocks)), fb.door('stands', show, w.blocks).stands], [[], true]);
const w2 = new World(); for (const b of w.blocks.filter(b => b.hash !== show.hash)) w2.add(b);
const wrong = new L.Signer(w2, ruth, K, undefined, ruth).asKey(X, ruth, ruth).write('grant', { kind: 'key', shown_key: X.pub, voices: [{ key: X.pub }, { key: K.pub }], clocks }, { subject: ruth, updates: ruth, key: ruth });
check('hidden key', 'a key whose hash is not in her genesis list shows nothing: bad_signature', codes(fb.door('valid', wrong, w2.blocks)), ['bad_signature']);
const next = top.asKey(T, show.hash, show.hash).write('observe', { kind: 'note', text: 'T speaks' }, {});
check('hidden key', 'T\'s next block names the grant that showed it: valid, and T signed it in the top place', [codes(fb.door('valid', next, w.blocks)), fb.door('signed_by_author', next, w.blocks)], [[], true]);
done();
