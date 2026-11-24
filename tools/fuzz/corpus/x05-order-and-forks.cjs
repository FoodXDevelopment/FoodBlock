'use strict';
// Order and forks: a low seq after a prev, a draw below its start, two sales off the line, a key replacement after a fork, two continuations of
// one line, dates and versions and units, a letgo after a twin, one sack read from six views, and allocations on two keys. Each world is built by hand.
const SRC = 'a world built by hand';
const own = (L, w, label, S, held = 'blocks') => L.ask(w, label, 'ownership', [S, held, null]);

// a Maria with a list of voices and keepers, and a key replacement by her relatives
function listWorld(L, w, names) {
  const { fb, keyHash, sorted } = L;
  const P = {}; for (const n of names) P[n] = w.person(n);
  const card = fb.generateKeypair();
  const keepers = { names: sorted([P.shop.id, P.host.id, P.aunt.id]), needed: 2 };
  const voices = [{ key_hash: keyHash(card) }, { names: sorted([P.mum.id, P.brother.id]), needed: 2, wait: 'P7D' }, { key: P.maria.keys.public_key_sign, wait: 'P30D' }];
  const list = L.keyGrant(w, P.maria, P.maria.keys, P.maria.id, { voices, clocks: keepers }, { updates: P.maria.id }, 'list');
  const again = L.confirm(w, P.maria, P.maria.keys, list, 'list again');
  const grantFor = (key, cut, note, after) => {
    const v2 = voices.map((v, i) => (i === 2 ? { ...v, key: key.public_key_sign } : v));
    const g = L.keyGrant(w, P.mum, P.mum.keys, P.maria.id, { voices: v2, clocks: keepers, counted_to: cut.hash }, { updates: list.hash }, note, after);
    const b1 = L.confirm(w, P.brother, P.brother.keys, g, 'b ' + note);
    const r1 = L.receipt(w, P.shop, g, 'r1 ' + note), r2 = L.receipt(w, P.host, g, 'r2 ' + note);
    const c1 = L.cutoff(w, P.shop, g, r1, 'P7D', 'c1 ' + note), c2 = L.cutoff(w, P.host, g, r2, 'P7D', 'c2 ' + note);
    const m2 = L.confirm(w, P.mum, P.mum.keys, g, 'm2 ' + note, [c1, c2]); const b2 = L.confirm(w, P.brother, P.brother.keys, g, 'b2 ' + note, [c1, c2, b1]);
    return { g, m2, b2 };
  };
  return { P, list, again, voices, keepers, grantFor };
}
const PEOPLE = ['maria', 'mum', 'brother', 'shop', 'host', 'aunt', 'amara', 'leila', 'sam'];

module.exports = [
  { name: 'low seq after prev, and its relatives', row: 12, source: SRC, build(L) {
    const { World, sackOf, draw, yes, put, hand, amt } = L;
    { const w = new World('05 a1.1 low seq after prev');
      const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const A = draw(w, harry, S, amara, null, { prev: S.hash, seq: 10 }, 'A'), B = draw(w, harry, S, leila, null, { prev: A.hash, seq: 7 }, 'B');
      yes(w, amara, A, 'a'); yes(w, leila, B, 'l');
      own(L, w, 'two draws ordered by prev and by seq', S);
      L.ask(w, 'check_chain', 'check_chain', [w.blocks.filter((b) => b.refs && b.refs.author === harry.id).concat([harry.g]), harry.id]);
      L.ask(w, 'fork_pairs', 'fork_pairs', ['blocks']); }
    { const w = new World('05 a1.2 steal-back');
      const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila'), sam = w.person('sam'), maria = w.person('maria');
      const S = sackOf(w, harry, { prev: harry.id, seq: 10 });
      const D1 = draw(w, harry, S, amara, null, { prev: S.hash, seq: 20 }, 'D1'); yes(w, amara, D1, 'a');
      const R = L.give(w, amara, S, maria, null, 'R'); yes(w, maria, R, 'm');
      own(L, w, '(a) before anything else', S);
      draw(w, harry, S, leila, null, { prev: S.hash, seq: 20 }, 'D2 twin');
      own(L, w, '(b) the twin revealed', S);
      const E = draw(w, harry, S, sam, null, { prev: w.find('D2 twin').hash, seq: 15 }, 'E'); yes(w, sam, E, 's');
      own(L, w, '(c) E at seq 15 after the twin', S); }
    { const w = new World('05 a1.3 foreign prev');
      const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila'), maria = w.person('maria');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const D1 = draw(w, harry, S, amara, null, { prev: S.hash, seq: 2 }, 'D1'), D2 = draw(w, harry, S, leila, null, { prev: maria.id, seq: 3 }, 'D2');
      yes(w, amara, D1, 'a'); yes(w, leila, D2, 'l');
      own(L, w, '(a) all held', S);
      L.ask(w, 'read_whole D2 back to S', 'read_whole', [D2.hash, S.hash, 'blocks']);
      own(L, w, '(b) Leila\'s view', S, w.blocks.filter((b) => b.hash !== D1.hash && !(b.refs && b.refs.answers === D1.hash))); }
    { const w = new World('05 a1.4 fork then foreign prev low seq');
      const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila'), sam = w.person('sam'), maria = w.person('maria');
      const mb = put(w, maria, 'observe', { kind: 'note', text: 'maria writes' }, {}, 'maria note');
      const S = sackOf(w, harry, { prev: harry.id, seq: 10 });
      const D1 = draw(w, harry, S, amara, null, { prev: S.hash, seq: 20 }, 'D1'); yes(w, amara, D1, 'a');
      draw(w, harry, S, leila, null, { prev: S.hash, seq: 20 }, 'D2');
      const E = draw(w, harry, S, sam, null, { prev: mb.hash, seq: 15 }, 'E'); yes(w, sam, E, 's');
      own(L, w, 'fork, then E with a foreign prev below the pair', S); }
    { const w = new World('05 a1.6 equal seq after prev');
      const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const A = draw(w, harry, S, amara, null, { prev: S.hash, seq: 10 }, 'A'), B = draw(w, harry, S, leila, null, { prev: A.hash, seq: 10 }, 'B');
      yes(w, amara, A, 'a'); yes(w, leila, B, 'l');
      own(L, w, 'B prev A at the same seq', S); }
    void hand; void amt;
  } },
  { name: 'a draw below its start, prev not held', row: 50, source: SRC, build(L) {
    const { World, sackOf, draw, yes, hand } = L;
    const w = new World('05 a1.5 draw below its start');
    const harry = w.person('harry'), amara = w.person('amara');
    const n1 = hand(w, harry, 'observe', { kind: 'note' }, {}, { prev: harry.id, seq: 1 }, 'n1');
    const S = sackOf(w, harry, { prev: n1.hash, seq: 5 });
    const D = draw(w, harry, S, amara, null, { prev: 'ab'.repeat(32), seq: 3 }, 'D');
    yes(w, amara, D, 'a');
    own(L, w, 'draw with seq below its start, prev not held', S);
  } },
  { name: 'two sales off the line', row: 47, source: SRC, build(L) {
    const { World, sackOf, draw, yes, put } = L;
    for (let k = 0; k < 4; k++) {
      const w = new World('05 a2b ' + k);
      const harry = w.person('harry'), s = w.person('stranger'), amara = w.person('amara'), leila = w.person('leila');
      const n1 = put(w, s, 'observe', { kind: 'note', text: 'a' + k }, {}, 'n1'), n2 = put(w, s, 'observe', { kind: 'note', text: 'b' + k }, {}, 'n2');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const A = draw(w, harry, S, amara, null, { prev: n1.hash, seq: 2 }, 'A'); yes(w, amara, A, 'a');
      const B = draw(w, harry, S, leila, null, { prev: n2.hash, seq: 3 }, 'B'); yes(w, leila, B, 'l');
      own(L, w, 'two sales with foreign prevs', S);
    }
  } },
  { name: 'a key replacement after a fork', row: 48, source: SRC, build(L) {
    const { World, amt, kindOf, yes, fb } = L;
    for (const variant of ['counted_to before the sale', 'counted_to after the sale', 'no earlier sale', 'a fork, then the replacement']) {
      const w = new World('05 a3b ' + variant);
      const { P, again, grantFor } = listWorld(L, w, PEOPLE);
      const S = L.by(w, P.maria, P.maria.keys, 'thing', { kind: 'maize', pack: amt('1', 'kg') }, { of: kindOf('maize') }, 'sack', [again]);
      const sell = variant !== 'no earlier sale' && variant !== 'a fork, then the replacement';
      if (variant.startsWith('a fork')) {
        const [f1, f2] = L.pairOf(w, P.maria, P.maria.keys, ['transfer', {}, { what: S.hash, to_owner: P.amara.id }, 'F1'], ['transfer', {}, { what: S.hash, to_owner: P.leila.id }, 'F2']);
        yes(w, P.amara, f1, 'a f1'); yes(w, P.leila, f2, 'l f2');
      }
      if (sell) { const D1 = L.by(w, P.maria, P.maria.keys, 'transfer', {}, { what: S.hash, to_owner: P.amara.id }, 'D1'); yes(w, P.amara, D1, 'a D1'); const R = L.give(w, P.amara, S, P.leila, null, 'R'); yes(w, P.leila, R, 'l R'); }
      const last = L.by(w, P.maria, P.maria.keys, 'observe', { kind: 'note', text: 'last' }, {}, 'last');
      own(L, w, '(a) before the relatives\' key grant', S);
      const phone2 = fb.generateKeypair();
      const cut = (variant === 'counted_to before the sale' || variant.startsWith('a fork')) ? S : last;
      const G = grantFor(phone2, cut, 'phone2', [last]);
      L.ask(w, 'the key grant stands', 'stands', [G.g, 'blocks']);
      const D2 = L.by(w, P.maria, phone2, 'transfer', {}, { what: S.hash, to_owner: P.sam.id }, 'D2 phone2', [G.m2, G.b2]);
      yes(w, P.sam, D2, 'sam yes');
      own(L, w, '(b) after the key grant stands and phone2 sells to Sam', S);
    }
  } },
  { name: 'two continuations of one line', row: 48, source: SRC, build(L) {
    const { World, amt, kindOf, yes, fb } = L;
    const w = new World('05 a3c');
    const { P, again, grantFor } = listWorld(L, w, PEOPLE);
    const S = L.by(w, P.maria, P.maria.keys, 'thing', { kind: 'maize', pack: amt('1', 'kg') }, { of: kindOf('maize') }, 'sack', [again]);
    const last = L.by(w, P.maria, P.maria.keys, 'observe', { kind: 'note' }, {}, 'last');
    const p2 = fb.generateKeypair(), p3 = fb.generateKeypair();
    const G2 = grantFor(p2, last, 'p2', [last]);
    const G3 = grantFor(p3, last, 'p3', [G2.b2]);
    L.ask(w, 'G2 stands', 'stands', [G2.g, 'blocks']); L.ask(w, 'G3 stands', 'stands', [G3.g, 'blocks']);
    L.ask(w, 'live keys', 'live_keys', [P.maria.id, 'blocks']);
    const A = L.by(w, P.maria, p2, 'transfer', {}, { what: S.hash, to_owner: P.amara.id }, 'A p2', [G2.m2, G2.b2]); yes(w, P.amara, A, 'a');
    const B = L.by(w, P.maria, p3, 'transfer', {}, { what: S.hash, to_owner: P.leila.id }, 'B p3', [G3.m2, G3.b2]); yes(w, P.leila, B, 'l');
    own(L, w, 'two continuations, sequential', S);
  } },
  { name: 'dates, versions, units, two accepts, one payment twice', row: 49, source: SRC, build(L) {
    const { World, amt, kindOf, hand, sackOf, draw, yes, put, fb } = L;
    const kg = (n) => amt(n, 'kg');
    { const w = new World('05 a4 M1 backdated accept');
      const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const D1 = hand(w, harry, 'transfer', { expires: '2026-11-12T18:00:00.000Z' }, { what: S.hash, to_owner: amara.id }, { prev: S.hash, seq: 2, at: '2026-11-12T09:00:00.000Z' }, 'D1');
      const D2 = draw(w, harry, S, leila, null, { prev: D1.hash, seq: 3, at: '2026-11-13T09:00:00.000Z' }, 'D2'); yes(w, leila, D2, 'l');
      own(L, w, '(a) next morning, amara silent', S);
      hand(w, amara, 'transfer', { status: 'accepted' }, { answers: D1.hash }, { prev: amara.id, seq: 1, at: '2026-11-12T17:59:00.000Z' }, 'amara backdated yes');
      own(L, w, '(b) amara\'s accept dated 17:59', S); }
    { const w = new World('05 a4 M2 a version');
      const harry = w.person('harry'), amara = w.person('amara'), leila = w.person('leila');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const D1 = draw(w, harry, S, amara, null, { prev: S.hash, seq: 2 }, 'D1'); yes(w, amara, D1, 'a');
      const S2 = hand(w, harry, 'thing', { kind: 'maize', pack: kg(1) }, { of: kindOf('maize'), updates: S.hash }, { prev: D1.hash, seq: 3 }, 'S2');
      const D2 = draw(w, harry, S2, leila, null, { prev: S2.hash, seq: 4 }, 'D2'); yes(w, leila, D2, 'l');
      own(L, w, 'ownership(S)', S); own(L, w, 'ownership(S2)', S2);
      const S3 = hand(w, harry, 'thing', { kind: 'maize', pack: kg(1) }, { of: kindOf('maize'), same_as: S.hash }, { prev: D2.hash, seq: 5 }, 'S3');
      own(L, w, 'ownership(S3 same_as S)', S3); }
    { const w = new World('05 a4 M3 negative seq');
      const harry = w.person('harry');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      for (const seq of [0, -5, -9007199254740991]) {
        const b = fb.create('observe', { at: '2026-11-12T10:00:00.000Z', audience: 'public', seq, kind: 'note' }, { author: harry.id, prev: S.hash });
        L.ask(w, 'valid at seq ' + seq, 'valid', [{ ...b, signature: fb.sign(b, harry.keys.private_key) }, 'blocks']);
      } }
    { const w = new World('05 a4 M4 units');
      const harry = w.person('harry'), amara = w.person('amara');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const D1 = draw(w, harry, S, amara, amt('0.5', 'kɡ'), { prev: S.hash, seq: 2 }, 'D1'); yes(w, amara, D1, 'a');
      own(L, w, 'a lookalike unit', S);
      for (const v of ['0.50', '00.5', '.5', '5e-1', '+0.5']) {
        const b = fb.create('transfer', { at: '2026-11-12T10:00:00.000Z', audience: 'public', seq: 3, amount: amt(v, 'kg') }, { author: harry.id, prev: D1.hash, what: S.hash, to_owner: amara.id });
        L.ask(w, 'valid of amount ' + v, 'valid', [{ ...b, signature: fb.sign(b, harry.keys.private_key) }, 'blocks']);
      } }
    { const w = new World('05 a4 M5 conjured outputs');
      const harry = w.person('harry');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const m = hand(w, harry, 'transform', {}, { derives_from: [S.hash] }, { prev: S.hash, seq: 2 }, 'make');
      const o1 = hand(w, harry, 'thing', { kind: 'flour', pack: kg(1) }, { derives_from: [m.hash] }, { prev: m.hash, seq: 3 }, 'o1');
      const o2 = hand(w, harry, 'thing', { kind: 'flour', pack: kg(1000) }, { derives_from: [m.hash] }, { prev: o1.hash, seq: 4 }, 'o2');
      own(L, w, 'output 1', o1); own(L, w, 'output 2 (1000 kg from a 1 kg sack)', o2); }
    { const w = new World('05 a4 M6 two accepts of one draw');
      const harry = w.person('harry'), amara = w.person('amara'), sam = w.person('sam');
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const D1 = draw(w, harry, S, amara, kg(1), { prev: S.hash, seq: 2 }, 'D1');
      yes(w, amara, D1, 'all'); yes(w, amara, D1, 'again 0.4', { amount: kg('0.4') });
      const D2 = draw(w, harry, S, sam, kg('0.6'), { prev: D1.hash, seq: 3, after: [w.blocks[w.blocks.length - 1].hash] }, 'D2'); yes(w, sam, D2, 's');
      own(L, w, '1 kg landed, then her own second word says 0.4', S); }
    { const w = new World('05 a4 M7 one payment, two words');
      const harry = w.person('harry'), maria = w.person('maria');
      const offer = put(w, harry, 'promise', { terms: { lines: [{ id: 'maize', what: kindOf('maize'), quantity: kg(1), price: amt('20', 'GBP') }] } }, { from: harry.id, to: maria.id }, 'offer');
      put(w, maria, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, 'acc');
      const pay = put(w, maria, 'transfer', { amount: amt('10', 'GBP') }, { to_owner: harry.id, for: offer.hash }, 'pay'); yes(w, harry, pay, 'yes pay');
      put(w, harry, 'observe', { kind: 'received', amount: amt('10', 'GBP') }, { for: offer.hash }, 'received');
      L.ask(w, 'promise_stage', 'promise_stage', [offer, 'blocks', {}]); }
  } },
  { name: 'the puppet accepts the twin, then lets go', row: 9, source: SRC, build(L) {
    const { World, sackOf, draw, yes, put } = L;
    for (const status of ['declined', 'stopped']) {
      const w = new World('03 letgo ' + status);
      const harry = w.person('harry'), amara = w.person('amara'), maria = w.person('maria'), puppet = w.person('puppet');
      const S = sackOf(w, harry, { prev: harry.id, seq: 10 });
      const D1 = draw(w, harry, S, amara, null, { prev: S.hash, seq: 20 }, 'D1'); yes(w, amara, D1, 'a');
      const R = L.give(w, amara, S, maria, null, 'R'); yes(w, maria, R, 'm');
      const D2 = draw(w, harry, S, puppet, null, { prev: S.hash, seq: 20 }, 'D2'); yes(w, puppet, D2, 'puppet accepts');
      put(w, puppet, 'observe', { status }, { answers: D2.hash }, 'puppet ' + status);
      own(L, w, `puppet accepted D2, then ${status}`, S);
    }
  } },
  { name: 'one sack read from six views', row: 9, source: SRC, build(L) {
    const { World, amt, thing, put, yes, no } = L;
    const sk = (v) => amt(v, 'sack');
    const w = new World('50 act');
    const harry = w.person('harry'), amara = w.person('amara'), pup = w.person('puppet');
    const note1 = put(w, harry, 'observe', { kind: 'note', text: 'oven on' }, {}, 'note1');
    const l7 = thing(w, harry, 'flour', sk(10), 'L7');
    const note2 = put(w, harry, 'observe', { kind: 'note', text: 'milled' }, {}, 'note2');
    const sale = put(w, harry, 'transfer', { amount: sk(10) }, { what: l7.hash, to_owner: amara.id }, 'sale');
    const ya = yes(w, amara, sale, 'amara yes');
    const actors = w.blocks.filter((b) => b.type === 'actor');
    own(L, w, 'V1 whole line held', l7);
    own(L, w, 'V2 sale and thing only', l7, [...actors, l7, sale, ya]);
    own(L, w, 'V3 missing note1 only', l7, [...actors, l7, note2, sale, ya]);
    const twin = w.add(L.signed(harry, harry.keys, 'transfer', { amount: sk(10) }, { what: l7.hash, to_owner: pup.id }, { prev: sale.refs.prev, seq: sale.state.seq }), 'twin');
    own(L, w, 'V4 a late twin, no puppet word', l7);
    yes(w, pup, twin, 'puppet yes');
    own(L, w, 'V5 the puppet accepts', l7);
    no(w, pup, twin, 'puppet no');
    own(L, w, 'V6 the puppet declines after its yes', l7);
    void note1;
  } },
  { name: 'two sales off the line, one naming a stranger\'s chain', row: 11, source: SRC, build(L) {
    const { World, sackOf, hand, yes, put } = L;
    for (let k = 0; k < 4; k++) {
      const w = new World('04 s3 ' + k);
      const harry = w.person('harry'), s = w.person('stranger'), amara = w.person('amara'), leila = w.person('leila');
      const n1 = put(w, s, 'observe', { kind: 'note', text: 'a' + k }, {}, 'n1'), n2 = put(w, s, 'observe', { kind: 'note', text: 'b' + k }, {}, 'n2');
      const chain = []; for (let i = 0; i < 8; i++) chain.push(put(w, s, 'observe', { kind: 'note', text: 'c' + i + '-' + k }, {}, 'c' + i));
      const S = sackOf(w, harry, { prev: harry.id, seq: 1 });
      const A = hand(w, harry, 'transfer', {}, { what: S.hash, to_owner: amara.id }, { prev: n1.hash, seq: 2, after: [chain[chain.length - 1].hash] }, 'A'); yes(w, amara, A, 'a');
      const B = hand(w, harry, 'transfer', {}, { what: S.hash, to_owner: leila.id }, { prev: n2.hash, seq: 3 }, 'B'); yes(w, leila, B, 'l');
      own(L, w, 'all held', S);
      own(L, w, 'without the stranger\'s chain', S, w.blocks.filter((b) => !chain.some((c) => c.hash === b.hash)));
    }
  } },
  { name: 'phone and till each allocate 6 of 10', row: 10, source: SRC, build(L) {
    const { World, kindOf, put, secondKey } = L;
    const q = (n) => ({ value: String(n), unit: 'loaf' });
    for (let k = 0; k < 4; k++) {
      const w = new World('04 s4 ' + k);
      const maria = w.person('maria'), amara = w.person('amara'), leila = w.person('leila');
      const till = secondKey(w, maria, 'till');
      for (let i = 0; i < (k % 2 ? 6 : 0); i++) put(w, maria, 'observe', { kind: 'note', text: 't' + i + k }, {}, 'till note ' + i, { key: till });
      const O = put(w, maria, 'promise', { terms: { lines: [{ id: 'bread', what: kindOf('bread'), quantity: q(10) }] } }, { from: maria.id }, 'open offer 10');
      const rA = put(w, amara, 'promise', { status: 'accepted', terms: { lines: [{ id: 'bread', quantity: q(6) }] } }, { answers: O.hash, for: O.hash }, 'amara asks 6');
      const rL = put(w, leila, 'promise', { status: 'accepted', terms: { lines: [{ id: 'bread', quantity: q(6) }] } }, { answers: O.hash, for: O.hash }, 'leila asks 6');
      put(w, maria, 'promise', { status: 'accepted', terms: { lines: [{ id: 'bread', quantity: q(6) }] } }, { answers: rA.hash, for: O.hash }, 'phone allocates amara');
      put(w, maria, 'promise', { status: 'accepted', terms: { lines: [{ id: 'bread', quantity: q(6) }] } }, { answers: rL.hash, for: O.hash }, 'till allocates leila', { key: till });
      L.ask(w, 'the offer\'s stage', 'promise_stage', [O, 'blocks', null]);
    }
  } },
];
