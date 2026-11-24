// A kind is a label, and no rule reads a kind protocol.json does not declare (blocks.md; protocol.json `kinds`). Maria's daily phone waits P1D on any word
// that lets another act for her (blocks.md, Finality). A thief with the phone signs a grant to himself and labels it "stop": it waits the day, as any grant does.
const L = require('../kit.cjs'); const { fb, World, P, check, done, mkKey } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
const w = new World(), maria = P(w, 'maria'), thief = P(w, 'thief'), clock = P(w, 'clock');
const phoneK = mkKey('maria-daily-phone');
const K1 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: phoneK.pub, wait: 'P1D' }], clocks: { names: [clock.id], needed: 1 } }, { subject: maria.id, updates: maria.id });
maria.write('observe', { kind: 'confirm' }, { confirms: K1.hash });
const phone = maria.asKey(phoneK, K1.hash);
for (const kind of ['stop', 'tool']) {
  const g = phone.write('grant', { kind, scope: { types: ['transfer'], parties: [thief.id] } }, { to: thief.id });
  check('a label', `the phone's grant to the thief labelled "${kind}": it waits the phone's day`, std(w, g), [false, ['wait']]);
}
done();
