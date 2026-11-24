// A voice's bounds. Maria's tap voice each £50, limit £200: a £12 tap stands; a £900 tap waits (confirm) until her face key says it; four £50 taps stand, a fifth waits.
// Her tablet under the tap voice, passed £50 (the key grant's own `limit`): a £20 payment fits, a £60 one waits. With `every` a week, a cutoff of her clock (refs.subject the list that brought the
// key in, `when` P7D) turns the period: two £50 taps stand, a third waits, a fourth after the cutoff stands.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, check, done, A, GBP, mkKey, kindOf } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
const w = new World(), maria = P(w, 'maria'), shop = P(w, 'shop');
const tapK = mkKey('maria-tap');
const K1 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tapK.pub, wait: 'PT0S', each: GBP(50), limit: GBP(200) }] }, { subject: maria.id, updates: maria.id });
const tap = maria.asKey(tapK, K1.hash);
const pay = (v, tag) => T(tap.write('transfer', { amount: GBP(v) }, { to_owner: shop.id }), tag);
const t12 = pay(12, 't12'), t900 = pay(900, 't900');
check('Voice bounds', 'a £12 tap stands; a £900 tap waits (confirm)', [std(w, t12), std(w, t900)], [[true, []], [false, ['confirm']]]);
const face = T(maria.write('observe', { kind: 'said' }, { confirms: t900.hash }), 'face');
check('Voice bounds', 'her face key (a voice above) says it: the £900 tap stands', std(w, t900), [true, []]);
// the line: £12 so far (the £900 stands as said by a voice above, and holds nothing on the tap's line)
const w2 = new World(), m2 = P(w2, 'maria'), s2 = P(w2, 'shop'), tk2 = mkKey('maria-tap2');
const K2 = m2.write('grant', { kind: 'key', voices: [{ key: m2.key.pub }, { key: tk2.pub, wait: 'PT0S', each: GBP(50), limit: GBP(200) }] }, { subject: m2.id, updates: m2.id });
const tp2 = m2.asKey(tk2, K2.hash);
const taps = [1, 2, 3, 4, 5].map(i => T(tp2.write('transfer', { amount: GBP(50) }, { to_owner: s2.id }), 'p' + i));
check('Voice bounds', 'four £50 taps stand, a fifth waits', taps.map(t => std(w2, t)), [[true, []], [true, []], [true, []], [true, []], [false, ['confirm']]]);
// the tablet, a key under the tap voice, passed £50 of the tap's line
const w3 = new World(), m3 = P(w3, 'maria'), s3 = P(w3, 'shop'), tk3 = mkKey('maria-tap3'), tab = mkKey('maria-tablet');
const K3 = m3.write('grant', { kind: 'key', voices: [{ key: m3.key.pub }, { key: tk3.pub, wait: 'PT0S', each: GBP(50), limit: GBP(200) }] }, { subject: m3.id, updates: m3.id });
const tp3 = m3.asKey(tk3, K3.hash);
const KT = T(tp3.write('grant', { kind: 'key', public_key_sign: tab.pub, limit: GBP(50) }, { subject: m3.id }), 'tablet-grant');
const tb = m3.asKey(tab, KT.hash);
const o20 = T(tb.write('transfer', { amount: GBP(20) }, { to_owner: s3.id }), 'tab20'), o60 = T(tb.write('transfer', { amount: GBP(60) }, { to_owner: s3.id }), 'tab60');
check('Voice bounds', 'the tablet grant passes £50 of the tap\'s line; the tablet\'s £20 fits, its £60 waits', [std(w3, KT), std(w3, o20), std(w3, o60)], [[true, []], [true, []], [false, ['confirm']]]);
// a weekly line: the period turns at her clock's cutoff
const w4 = new World(), m4 = P(w4, 'maria'), s4 = P(w4, 'shop'), node = P(w4, 'node'), tk4 = mkKey('maria-tap4');
const K4 = m4.write('grant', { kind: 'key', voices: [{ key: m4.key.pub }, { key: tk4.pub, wait: 'PT0S', each: GBP(50), limit: GBP(100), every: 'P7D' }], clocks: { names: [node.id], needed: 1 } }, { subject: m4.id, updates: m4.id });
const tp4 = m4.asKey(tk4, K4.hash);
const wk = [1, 2, 3].map(i => T(tp4.write('transfer', { amount: GBP(50) }, { to_owner: s4.id }), 'w' + i));
const cut = T(node.write('observe', { kind: 'cutoff', when: 'P7D' }, { subject: K4.hash, derives_from: wk[2].hash }), 'cut');
const w5 = T(tp4.write('transfer', { amount: GBP(50) }, { to_owner: s4.id, after: cut.hash }), 'w4');
check('Voice bounds', 'every week: two £50 taps stand, a third waits; one after her clock\'s cutoff stands (a new period)', [...wk, w5].map(t => std(w4, t)), [[true, []], [true, []], [false, ['confirm']], [true, []]]);
// a key grant that adds a key under a capped voice may pass it an `each` no higher than the voice's (identity.md, A voice's bounds): the
// tablet passed £50 with each £20: a £20 payment fits, a £25 one waits
const w6 = new World(), m6 = P(w6, 'maria'), s6 = P(w6, 'shop'), tk6 = mkKey('maria-tap6'), tab6 = mkKey('maria-tablet6');
const K6 = m6.write('grant', { kind: 'key', voices: [{ key: m6.key.pub }, { key: tk6.pub, wait: 'PT0S', each: GBP(50), limit: GBP(200) }] }, { subject: m6.id, updates: m6.id });
const tp6 = m6.asKey(tk6, K6.hash);
const KT6 = T(tp6.write('grant', { kind: 'key', public_key_sign: tab6.pub, limit: GBP(50), each: GBP(20) }, { subject: m6.id }), 'tablet-each');
const tb6 = m6.asKey(tab6, KT6.hash);
const e20 = T(tb6.write('transfer', { amount: GBP(20) }, { to_owner: s6.id }), 'each20'), e25 = T(tb6.write('transfer', { amount: GBP(25) }, { to_owner: s6.id }), 'each25');
check('Voice bounds', 'the tablet grant passing each £20 is read; the tablet\'s £20 fits, its £25 is past its each and waits', [fb.door('read', KT6, w6.blocks).length, std(w6, KT6), std(w6, e20), std(w6, e25)], [0, [true, []], [true, []], [false, ['confirm']]]);
done();
