'use strict';
// Stress seat 01, the line rule (foodx/research/2026-11-12-foodblock-stress/01-scratch/new.cjs): worlds N1 to N10, built as the seat built
// them. Rows 6 (N6: one key, two key grants), 7 (N3: a crash twin declined) and 8 (N4, N10: a fork carried over to a new key).
const SRC = 'stress 01 (01-scratch/new.cjs)';

function mariaWorld(L, name) {
  const { World, fb, keyHash, sorted, plus } = L;
  const w = new World(name);
  const by = (p, key, type, state, refs, note, after = []) => w.w(p, type, state, refs, note, { key, after: sorted(after.map((b) => b.hash)) });
  const P = {}; for (const n of ['maria', 'mum', 'brother', 'shop', 'host', 'aunt', 'amara', 'leila', 'sam', 'puppet']) P[n] = w.person(n);
  const card = fb.generateKeypair();
  const keepers = { names: sorted([P.shop.id, P.host.id, P.aunt.id]), needed: 2 };
  const voices = [{ key_hash: keyHash(card) }, { names: sorted([P.mum.id, P.brother.id]), needed: 2, wait: 'P7D' }, { key: P.maria.keys.public_key_sign, wait: 'P30D' }];
  const confirm = (p, key, word, note, after = []) => by(p, key, 'observe', { kind: 'note' }, { confirms: [word.hash] }, note, after);
  const list = by(P.maria, P.maria.keys, 'grant', { kind: 'key', voices, clocks: keepers }, { subject: P.maria.id, updates: P.maria.id }, 'maria writes her list');
  const again = confirm(P.maria, P.maria.keys, list, 'maria signs her list again');
  const replace = (cutBlock, after) => {
    const phone2 = fb.generateKeypair();
    const v2 = voices.map((v, i) => (i === 2 ? { ...v, key: phone2.public_key_sign } : v));
    const g = by(P.mum, P.mum.keys, 'grant', { kind: 'key', voices: v2, clocks: keepers, counted_to: cutBlock.hash }, { subject: P.maria.id, updates: list.hash }, 'mum: new phone key', after);
    const b1 = confirm(P.brother, P.brother.keys, g, 'brother confirms');
    const r1 = w.w(P.shop, 'observe', { kind: 'receipt' }, { derives_from: [g.hash] }, 'shop receipt'), r2 = w.w(P.host, 'observe', { kind: 'receipt' }, { derives_from: [g.hash] }, 'host receipt');
    const c1 = w.w(P.shop, 'observe', { kind: 'cutoff', when: 'P7D' }, { subject: g.hash, derives_from: [r1.hash] }, 'shop cutoff'), c2 = w.w(P.host, 'observe', { kind: 'cutoff', when: 'P7D' }, { subject: g.hash, derives_from: [r2.hash] }, 'host cutoff');
    const m2 = confirm(P.mum, P.mum.keys, g, 'mum again', [c1, c2]), b2 = confirm(P.brother, P.brother.keys, g, 'brother again', [c1, c2, b1]);
    return { phone2, g, after: [m2, b2] };
  };
  return { w, P, by, again, list, replace };
}
const own = (L, w, label, S, held = 'held') => L.ask(w, label, 'ownership', [S, held, null]);

module.exports = [
  { name: 'N1 counted_to picks the twin', row: 'extra', source: SRC, build(L) {
    const { w, P, by, again, replace } = mariaWorld(L, '01 N1');
    const S = by(P.maria, P.maria.keys, 'thing', { kind: 'maize', pack: L.amt(1, 'kg') }, { of: L.kindOf('maize') }, 'sack', [again]);
    const [f1, f2] = L.pairOf(w, P.maria, P.maria.keys, ['transfer', {}, { what: S.hash, to_owner: P.amara.id }, 'F1'], ['transfer', {}, { what: S.hash, to_owner: P.puppet.id }, 'F2']);
    L.yes(w, P.amara, f1, 'amara yes'); L.yes(w, P.puppet, f2, 'puppet yes');
    own(L, w, '(a) the pair', S);
    replace(f2, [f2]);
    own(L, w, '(b) counted_to the puppet twin', S);
  } },
  { name: 'N2 two devices one key', row: 'extra', source: SRC, build(L) {
    const { World, hand, draw, kindOf, amt, yes } = L;
    const w = new World('01 N2');
    const maria = w.person('maria'), amara = w.person('amara'), leila = w.person('leila'), sam = w.person('sam');
    const n = L.next(w, maria.keys, maria);
    const S1 = hand(w, maria, 'thing', { kind: 'maize', pack: amt(1, 'kg') }, { of: kindOf('maize') }, { prev: n.prev, seq: n.seq }, 'sack1');
    const S2 = hand(w, maria, 'thing', { kind: 'maize', pack: amt(1, 'kg') }, { of: kindOf('maize') }, { prev: S1.hash, seq: n.seq + 1 }, 'sack2');
    const S3 = hand(w, maria, 'thing', { kind: 'maize', pack: amt(1, 'kg') }, { of: kindOf('maize') }, { prev: S2.hash, seq: n.seq + 2 }, 'sack3');
    const a = draw(w, maria, S1, amara, null, { prev: S3.hash, seq: n.seq + 3 }, 'phone'); yes(w, amara, a, 'amara yes');
    const b = draw(w, maria, S2, leila, null, { prev: S3.hash, seq: n.seq + 3 }, 'tablet'); yes(w, leila, b, 'leila yes');
    const c = draw(w, maria, S3, sam, null, { prev: a.hash, seq: n.seq + 4 }, 'phone later'); yes(w, sam, c, 'sam yes');
    own(L, w, 'sack1', S1); own(L, w, 'sack2', S2); own(L, w, 'sack3 (sold after the fork)', S3);
  } },
  { name: 'N3 crash twin, one declined', row: 7, source: SRC + ' N3; table row 7 (stress 01 B6)', build(L) {
    const { World, sackOf, draw, yes, no } = L;
    const w = new World('01 N3');
    const maria = w.person('maria'), amara = w.person('amara');
    const S = sackOf(w, maria, { prev: maria.id, seq: 1 }, 'sack');
    const t1 = draw(w, maria, S, amara, null, { prev: S.hash, seq: 2 }, 'T1'), t2 = draw(w, maria, S, amara, null, { prev: S.hash, seq: 2 }, 'T2');
    yes(w, amara, t1, 'yes T1'); yes(w, amara, t2, 'yes T2');
    own(L, w, '(a) the same sale signed twice', S);
    no(w, amara, t2, 'amara declines T2');
    own(L, w, '(b) after Amara declines T2', S);
  } },
  { name: 'N4 restored backup, carried to a new key', row: 8, source: SRC + ' N4; table row 8 (stress 01 B4)', build(L) {
    const { w, P, by, again, replace } = mariaWorld(L, '01 N4');
    const { hand, yes, kindOf, amt } = L;
    const S2 = by(P.maria, P.maria.keys, 'thing', { kind: 'maize', pack: amt(1, 'kg') }, { of: kindOf('maize') }, 'sack2', [again]);
    const S3 = by(P.maria, P.maria.keys, 'thing', { kind: 'maize', pack: amt(1, 'kg') }, { of: kindOf('maize') }, 'sack3');
    const n = L.next(w, P.maria.keys, P.maria);
    const toLeila = hand(w, P.maria, 'transfer', {}, { what: S2.hash, to_owner: P.leila.id }, { prev: n.prev, seq: n.seq }, 'to leila');
    yes(w, P.leila, toLeila, 'leila yes');
    const toSam = hand(w, P.maria, 'transfer', {}, { what: S2.hash, to_owner: P.sam.id }, { prev: n.prev, seq: n.seq }, 'restored: to sam');
    yes(w, P.sam, toSam, 'sam yes');
    own(L, w, '(a) sack2 sold again by the restored phone', S2);
    const r = replace(S3, [toLeila, toSam]);
    const D = by(P.maria, r.phone2, 'transfer', {}, { what: S3.hash, to_owner: P.amara.id }, 'new phone: sack3', r.after); yes(w, P.amara, D, 'amara yes');
    const E = by(P.maria, r.phone2, 'transfer', {}, { what: S2.hash, to_owner: P.amara.id }, 'new phone: sack2'); yes(w, P.amara, E, 'amara yes 2');
    own(L, w, '(b) sack3 sold by the new key', S3);
    own(L, w, '(c) sack2 sold again by the new key', S2);
  } },
  { name: 'N5 a second key\'s first block', row: 'extra', source: SRC, build(L) {
    const { World, put, kindOf, amt, yes } = L;
    const w = new World('01 N5');
    const maria = w.person('maria'), amara = w.person('amara');
    [1, 2, 3].forEach((i) => put(w, maria, 'observe', { kind: 'note', text: 'day ' + i }, {}, 'note ' + i));
    const tab = L.secondKey(w, maria, 'tablet key grant');
    const S = put(w, maria, 'thing', { kind: 'maize', pack: amt(1, 'kg') }, { of: kindOf('maize') }, 'tablet: sack', { key: tab });
    const D = L.give(w, maria, S, amara, null, 'tablet: to amara', {}, { key: tab }); yes(w, amara, D, 'amara yes');
    own(L, w, 'the tablet sells the sack it signed', S);
  } },
  { name: 'N6 one key, two key grants', row: 6, source: SRC + ' N6; table row 6 (stress 01 B5)', build(L) {
    const { World, put, kindOf, amt, yes, fb } = L;
    const w = new World('01 N6');
    const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila');
    const tab = L.secondKey(w, harry, 'G1');
    const S = put(w, harry, 'thing', { kind: 'maize', pack: amt(1, 'kg') }, { of: kindOf('maize') }, 'K2: sack', { key: tab });
    const A = L.give(w, harry, S, amara, null, 'K2 under G1: to amara', {}, { key: tab }); yes(w, amara, A, 'amara yes');
    const G2 = put(w, harry, 'grant', { kind: 'key', public_key_sign: tab.public_key_sign }, { subject: harry.id }, 'G2 brings K2 in again');
    const G2y = put(w, harry, 'observe', { kind: 'note' }, { confirms: [G2.hash] }, 'G2 again');
    const b = fb.create('transfer', { at: L.at(), audience: 'public', seq: 1 }, { author: harry.id, prev: G2.hash, key: G2.hash, after: [G2y.hash], what: S.hash, to_owner: leila.id });
    const B = w.add({ ...b, signature: fb.sign(b, tab.private_key) }, 'K2 under G2: to leila');
    yes(w, leila, B, 'leila yes');
    L.ask(w, 'fork_pairs', 'fork_pairs', ['held']);
    own(L, w, 'one key, a second line from its second grant', S);
  } },
  { name: 'N7 rounds', row: 'extra', source: SRC, build(L) {
    const { World, sackOf, draw, yes } = L;
    const w = new World('01 N7');
    const harry = w.person('harry');
    let seq = 1000;
    const S = sackOf(w, harry, { prev: harry.id, seq });
    let prev = S;
    for (let r = 1; r <= 2; r++) {
      seq -= 10;
      const buyer = w.person('buyer' + r), puppet = w.person('puppet' + r);
      const sale = draw(w, harry, S, buyer, null, { prev: prev.hash, seq }, 'sale ' + r); yes(w, buyer, sale, 'buyer yes ' + r);
      own(L, w, 'round ' + r + ': after the sale', S);
      prev = draw(w, harry, S, puppet, null, { prev: prev.hash, seq }, 'twin ' + r);
    }
  } },
  { name: 'N8 two branches, two buyers who never compare', row: 'extra', source: SRC, build(L) {
    const { World, sackOf, draw, yes } = L;
    const w = new World('01 N8');
    const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila');
    const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
    const A = draw(w, harry, S, amara, null, { prev: S.hash, seq: 2 }, 'to amara'); const ya = yes(w, amara, A, 'amara yes');
    const B = draw(w, harry, S, leila, null, { prev: S.hash, seq: 2 }, 'to leila'); const yl = yes(w, leila, B, 'leila yes');
    own(L, w, 'Amara\'s view', S, w.blocks.filter((b) => b !== B && b !== yl));
    own(L, w, 'Leila\'s view', S, w.blocks.filter((b) => b !== A && b !== ya));
  } },
  { name: 'N9 low seq after a landed sale', row: 'extra', source: SRC, build(L) {
    const { World, sackOf, draw, yes, hand } = L;
    const w = new World('01 N9');
    const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila');
    const n1 = hand(w, harry, 'observe', { kind: 'note' }, {}, { prev: harry.id, seq: 1 }, 'n1');
    const S = sackOf(w, harry, { prev: n1.hash, seq: 5 });
    const D1 = draw(w, harry, S, amara, null, { prev: S.hash, seq: 6 }, 'D1'); yes(w, amara, D1, 'amara yes');
    own(L, w, '(a) Amara owns', S);
    const X = hand(w, harry, 'observe', { kind: 'note' }, {}, { prev: D1.hash, seq: 3 }, 'X: prev D1, seq 3');
    const Y = draw(w, harry, S, leila, null, { prev: X.hash, seq: 7 }, 'Y'); yes(w, leila, Y, 'leila yes');
    own(L, w, '(b) after X (low seq) and Y (prev X)', S);
  } },
  { name: 'N10 partial fork then a new key', row: 8, source: SRC + ' N10; table row 8 (Sam 8 kg)', build(L) {
    const { w, P, by, again, replace } = mariaWorld(L, '01 N10');
    const { amt, kindOf, yes } = L;
    const kg = (n) => amt(n, 'kg');
    const F = by(P.maria, P.maria.keys, 'thing', { kind: 'flour', pack: kg(10) }, { of: kindOf('flour') }, 'flour 10 kg', [again]);
    const [t1, t2] = L.pairOf(w, P.maria, P.maria.keys, ['transfer', { amount: kg(2) }, { what: F.hash, to_owner: P.amara.id }, 'T1'], ['transfer', { amount: kg(2) }, { what: F.hash, to_owner: P.amara.id }, 'T2']);
    yes(w, P.amara, t1, 'amara yes 1'); yes(w, P.amara, t2, 'amara yes 2');
    const r = replace(F, [t1, t2]);
    const D = by(P.maria, r.phone2, 'transfer', { amount: kg(8) }, { what: F.hash, to_owner: P.sam.id }, 'new phone: 8 kg to sam', r.after); yes(w, P.sam, D, 'sam yes');
    own(L, w, 'flour after a partial fork and the new key\'s 8 kg', F);
  } },
];
