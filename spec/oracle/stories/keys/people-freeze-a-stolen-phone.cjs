// Her people freeze a stolen phone (identity.md, The people of a voice reach above it). Ruth's list: a hidden top key, her people Kate, Tom and Priya
// (2 of 3, wait P7D), her card, her phone. Her people sign a key grant that only leaves the phone out: it reaches above nothing, so it narrows and
// stands once two of them have signed it, with `above: true` or without. A key grant of theirs that reaches above their place waits the 7 days.
const L = require('../kit.cjs'); const { fb, World, P, check, done, day, mkKey, sha, cj, signRaw, A } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
for (const above of [true, false]) {
  const w = new World();
  const kate = P(w, 'kate'), tom = P(w, 'tom'), priya = P(w, 'priya'), wanjiru = P(w, 'wanjiru-clock');
  const T = mkKey('ruth-top'), D = mkKey('ruth-phone'), K = mkKey('ruth-card'), K2 = mkKey('ruth-new-card');
  const kin = { names: [kate.id, tom.id, priya.id].sort(), needed: 2, wait: 'P7D', ...(above ? { above: true } : {}) };
  const voices = [{ key_hash: fb.door('key_hash', T.pub) }, kin, { key: K.pub }, { key: D.pub, wait: 'P1D', limit: A('500', 'GBP') }];
  const clocks = { names: [wanjiru.id], needed: 1 };
  const g = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: K.pub, voices, clocks }, refs: {} };
  const ruth = sha(cj(g)); w.add({ hash: ruth, ...g, signature: signRaw(K, cj(g)) });
  const FR = kate.write('grant', { kind: 'key', voices: [voices[0], voices[1], voices[2]], clocks }, { subject: ruth, updates: ruth });
  tom.write('observe', { kind: 'confirm' }, { confirms: FR.hash });
  check('freeze', `above ${above}: two of her people leave the stolen phone out: it narrows, so it stands at once`, std(w, FR), [true, []]);
  if (above) {
    const UP = kate.write('grant', { kind: 'key', voices: [{ key: K2.pub }, voices[1], voices[2], voices[3]], clocks }, { subject: ruth, updates: ruth });
    tom.write('observe', { kind: 'confirm' }, { confirms: UP.hash });
    check('freeze', 'above true: a key grant of theirs that puts a new key in the top place, above their own, is never narrowing: it waits their 7 days', std(w, UP)[0], false);
  }
}
done();
