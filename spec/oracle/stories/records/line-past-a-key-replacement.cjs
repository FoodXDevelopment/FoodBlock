const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, drawsOf, mkKey } = L;
const decline = (s, t) => s.write('transfer', { status: 'declined' }, { answers: t.hash });
// A line past a key replacement. World: Maria M0 (card first voice), phone key P. P: F 10 kg; P sells 6 kg to Leila and, at the same place, 6 kg to Ben. Card: key grant putting tablet key T in P's place,
// counted_to the block before the pair. T sells 8 kg of F to Sam: past. Ben declines: Leila 6 lands. T sells 4 kg to Amara: takes. Sam's 8 still past.
const w = new World(), maria = P(w, 'maria'), leila = P(w, 'leila'), ben = P(w, 'ben'), sam = P(w, 'sam'), amara = P(w, 'amara');
const pK = mkKey('maria-phone'), tK = mkKey('maria-tablet');
const kg1 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: pK.pub, wait: 'PT0S' }] }, { subject: maria.id, updates: maria.id });
const c1 = maria.write('observe', { kind: 'confirm' }, { confirms: kg1.hash });
const phone = maria.asKey(pK, kg1.hash);
phone.write('observe', { kind: 'note' }, { after: [c1.hash] });
const K = kindOf(phone, 'flour'), F = T(instance(phone, K, { pack: A('10', 'kg') }), 'F');
const dL = deal(phone, F, leila, A('6', 'kg')), dB = deal(phone, F, ben, A('6', 'kg'));
const base = phone.head, seq0 = phone.seq;
const sL = T(sell(phone, F, leila, dL, A('6', 'kg')), 'to-Leila'); phone.head = base; phone.seq = seq0;
const sB = T(sell(phone, F, ben, dB, A('6', 'kg')), 'to-Ben');
const kg2 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tK.pub, wait: 'PT0S' }], counted_to: base }, { subject: maria.id, updates: kg1.hash });
const c2 = maria.write('observe', { kind: 'confirm' }, { confirms: kg2.hash });
const tablet = maria.asKey(tK, kg2.hash);
tablet.write('observe', { kind: 'note' }, { after: [c2.hash] });
const dS = deal(tablet, F, sam, A('8', 'kg'));
const toSam = T(sell(tablet, F, sam, dS, A('8', 'kg')), 'T-to-Sam');
const why = (r, n) => drawsOf(r).filter(x => x[0] === n).map(x => x.slice(1));
let r = own(w, F);
check('line past a key replacement', '(4) T sells 8 to Sam: past', why(r, 'T-to-Sam'), [[false, 'past', null]]);
check('line past a key replacement', '(4) the pair stands: no owner on the pair', r.pair.length, 2);
const dec = decline(ben, sB);
r = own(w, F);
check('line past a key replacement', '(5) Ben declines: Leila 6 lands', why(r, 'to-Leila'), [[true, null, 'landed']]);
const dA = deal(tablet, F, amara, A('4', 'kg'));
const toAmara = T(tablet.write('transfer', { amount: A('4', 'kg') }, { what: F.hash, to_owner: amara.id, for: dA.o.hash, after: [dA.a.hash, dec.hash] }), 'T-to-Amara'); // it has Ben's decline in its past
r = own(w, F);
check('line past a key replacement', '(6) T sells 4 to Amara: takes', why(r, 'T-to-Amara').map(x => x[0]), [true]);
check('line past a key replacement', '(6) Sam\'s 8 still past', why(r, 'T-to-Sam'), [[false, 'past', null]]);
done();
