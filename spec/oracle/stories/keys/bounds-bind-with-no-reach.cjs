// A voice's bounds bind whatever its `reach` (identity.md, A voice's bounds). Maria's card brings in her phone with `each` £50 and no `reach`. The
// phone's £40 payment fits and stands; its £100 payment does not fit, and waits for a voice above it (`confirm`), as it would with a reach.
const L = require('../kit.cjs'); const { fb, World, P, check, done, mkKey, A } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
const w = new World(), maria = P(w, 'maria'), sam = P(w, 'sam'), clock = P(w, 'clock');
const phoneK = mkKey('maria-phone-no-reach');
const K1 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: phoneK.pub, wait: 'PT0S', each: A('50', 'GBP') }], clocks: { names: [clock.id], needed: 1 } }, { subject: maria.id, updates: maria.id });
maria.write('observe', { kind: 'confirm' }, { confirms: K1.hash });
const phone = maria.asKey(phoneK, K1.hash);
const small = phone.write('transfer', { amount: A('40', 'GBP') }, { to_owner: sam.id });
const big = phone.write('transfer', { amount: A('100', 'GBP') }, { to_owner: sam.id });
check('bounds', 'no reach: the phone\'s £40 fits its each and stands', std(w, small), [true, []]);
check('bounds', 'no reach: the phone\'s £100 is above its each: it waits for a voice above (confirm)', std(w, big), [false, ['confirm']]);
done();
