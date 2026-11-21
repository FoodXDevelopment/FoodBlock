'use strict';
// Stress seats 11, 12, 15, 26, 27, 35 and security 09: makes, pairs of a make and a give, a lone voice, "not me", a bare offer, payments and
// the payee's word, prices per unit, a bond on a condition, an end the accept has seen. Each from foodx/research/2026-11-12-foodblock-stress/
// NN-scratch/ (or security 09-scratch/), built as the seat built it.
const ST = 'stress ';

module.exports = [
  { name: 'c-pair-which: a pair of a make and a give', row: 15, source: ST + '12 (12-scratch/c-pair-which.cjs); table row 15', build(L) {
    const { World, amt, thing, pairOf } = L;
    const kg = (v) => amt(v, 'kg');
    for (let i = 0; i < 3; i++) {
      const w = new World('12 pair ' + i);
      const mama = w.person('mama'), leila = w.person('leila');
      const t = thing(w, mama, 'tomatoes', kg(10), 't');
      pairOf(w, mama, mama.keys, ['transform', { inputs: [{ from: t.hash, amount: kg('10') }] }, { derives_from: [t.hash] }, 'A'], ['transfer', { amount: kg('10') }, { what: t.hash, to_owner: leila.id }, 'B']);
      L.ask(w, 'the make and the give at one place', 'ownership', [t, 'held', null]);
    }
  } },
  { name: 'e-make-alone: a lone make', row: 16, source: ST + '12 (12-scratch/e-make-alone-hand.cjs); security 09 (09-scratch/e-lone-voice.cjs); table row 16', build(L) {
    const { World, amt, thing, signed, next, put } = L;
    const kg = (v) => amt(v, 'kg');
    for (const how of ['hand', 'writer']) {
      const w = new World('12 make ' + how);
      const mama = w.person('mama');
      const t = thing(w, mama, 'tomatoes', kg(10), 't');
      const st = { inputs: [{ from: t.hash, amount: kg('10') }] }, rf = { derives_from: [t.hash] };
      if (how === 'hand') { const l = next(w, mama.keys, mama); w.add(signed(mama, mama.keys, 'transform', st, rf, { prev: l.prev, seq: l.seq }), 'make'); } else put(w, mama, 'transform', st, rf, 'make');
      L.ask(w, 'a make, ' + how, 'ownership', [t, 'held', null]);
    }
    const w = new World('09 lone voice');
    const leila = w.person('leila');
    const flour = thing(w, leila, 'flour', kg(2), 'flour');
    L.ask(w, 'her thing stands', 'stands', [flour, 'held']);
    const make = put(w, leila, 'transform', { inputs: [{ from: flour.hash, amount: kg('1') }] }, { derives_from: [flour.hash] }, 'make');
    L.ask(w, 'her make, alone: stands', 'stands', [make, 'held']);
    L.ask(w, 'her make, alone: the flour', 'ownership', [flour, 'held', null]);
    const note = put(w, leila, 'observe', { kind: 'received', amount: amt('5', 'GBP') }, {}, 'received');
    L.ask(w, 'her received, alone: stands', 'stands', [note, 'held']);
    const loaf = put(w, leila, 'thing', { kind: 'loaf' }, { derives_from: [make.hash] }, 'loaf');
    L.ask(w, 'her make, once her loaf names it: stands', 'stands', [make, 'held']);
    L.ask(w, 'her loaf: stands', 'stands', [loaf, 'held']);
    L.ask(w, 'her loaf: owner', 'ownership', [loaf, 'held', null]);
  } },
  { name: 'h-not-me: "not me" with two voices', row: 17, source: ST + '12 (12-scratch/h-not-me-two-voices.cjs); table row 17', build(L) {
    const { World, fb, keyHash, sorted, by, confirm, keyGrant } = L;
    const w = new World('12 not me, two voices');
    const maria = w.person('maria'), mum = w.person('mum'), brother = w.person('brother');
    w.person('leila');
    const card = fb.generateKeypair();
    const voices = [{ key_hash: keyHash(card) }, { names: sorted([mum.id, brother.id]), needed: 2, wait: 'P7D' }, { key: maria.keys.public_key_sign, wait: 'P30D' }];
    const list = keyGrant(w, maria, maria.keys, maria.id, { voices }, { updates: maria.id }, 'list');
    const yes = confirm(w, maria, maria.keys, list, 'list again');
    const honest = by(w, maria, maria.keys, 'observe', { kind: 'note', text: 'last honest' }, {}, 'honest', [yes]);
    const came = by(w, maria, maria.keys, 'observe', { kind: 'received', amount: { value: '400', unit: 'KES' } }, {}, 'thief: 400 came');
    const named = by(w, maria, maria.keys, 'observe', { kind: 'note' }, { derives_from: [came.hash] }, 'thief: names it');
    const cut = keyGrant(w, mum, mum.keys, maria.id, { voices: voices.filter((_, i) => i !== 2), counted_to: honest.hash }, { updates: list.hash }, 'mum: the list without the phone');
    confirm(w, brother, brother.keys, cut, 'brother confirms');
    const late = by(w, maria, maria.keys, 'observe', { kind: 'received', amount: { value: '900', unit: 'KES' } }, {}, 'thief after the cut', [cut]);
    for (const [t, b] of [['the cut', cut], ['the honest block', honest], ['the thief\'s 400 came', came], ['the thief\'s later block', named], ['the thief\'s 900 came after the cut', late]]) {
      L.ask(w, t + ': stands', 'stands', [b, 'held']);
      L.ask(w, t + ': signed_by_author', 'signed_by_author', [b, 'held']);
    }
  } },
  { name: 'r2 a bare offer and accept (the stage asked by id)', row: 18, source: ST + '15 (15-scratch/r2-offer.cjs); table row 18', build(L) {
    const { World, put, amt, thing } = L;
    for (const rs of [null, 'a'.repeat(64)]) {
      const w = new World('15 offer ' + (rs ? 'with' : 'without') + ' rule_set');
      const maria = w.person('maria'), harry = w.person('harry');
      const loaves = thing(w, maria, 'bread', null, 'bread kind');
      const offer = put(w, maria, 'promise', { terms: { price: amt('60', 'KES'), quantity: amt('20', 'loaf') }, ...(rs ? { rule_set: rs } : {}) }, { what: loaves.hash, from: maria.id, to: harry.id }, 'offer');
      const acc = put(w, harry, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, 'accept');
      for (const [n, b] of [['offer', offer], ['accept', acc]]) { L.ask(w, n + ': valid', 'valid', [b, 'held']); L.ask(w, n + ': read', 'read', [b, 'held']); }
      L.ask(w, 'promise_stage asked with the offer\'s id', 'promise_stage', [offer.hash, 'held']);
      L.ask(w, 'promise_stage asked with the offer', 'promise_stage', [offer, 'held', {}]);
    }
  } },
  { name: 't1 the payee\'s word: receipts, silence, forged credit', row: '19-22', source: ST + '26 (26-scratch/t1.cjs, A to E); table rows 19 to 22', build(L) {
    const { World, kindOf, amt, put, thing, give, yes, deal } = L;
    const pay = (w, p, to, amount, head, note, refs = {}) => put(w, p, 'transfer', { amount }, { to_owner: to.id, for: head.hash, ...refs }, note);
    const KES = (n, of) => amt(n, 'KES', of);
    const rec = (w, p, n, head, extra = {}, refs = {}) => put(w, p, 'observe', { kind: 'received', amount: KES(n), ...extra }, { for: head.hash, ...refs }, 'received ' + n);
    const stage = (w, d, label) => { const m = /\(row (\d+)\)/.exec(label); L.ask(w, label, 'promise_stage', [d.offer, 'held', {}], m ? { row: Number(m[1]) } : {}); };
    { const w = new World('26 A1'); const mama = w.person('mama'), leila = w.person('leila');
      const d = deal(w, mama, leila, kindOf('mandazi'), { quantity: amt(2, 'piece'), price: KES(20) }, 'o');
      const p = pay(w, leila, mama, KES(20), d.offer, 'pay'); yes(w, mama, p, 'yes'); rec(w, mama, 20, d.offer);
      stage(w, d, 'A1 accept of 20 and her received 20 (row 22)'); }
    { const w = new World('26 A2'); const m = w.person('mama'), l = w.person('leila');
      const d = deal(w, m, l, kindOf('mandazi'), { quantity: amt(2, 'piece'), price: KES(20) }, 'o');
      rec(w, m, 20, d.offer); put(w, m, 'observe', { kind: 'received', amount: KES(20) }, { for: d.offer.hash }, 'received again');
      stage(w, d, 'A2 two received 20'); }
    { const w = new World('26 A3'); const m = w.person('mama'), l = w.person('leila');
      const d = deal(w, m, l, kindOf('mandazi'), { quantity: amt(2, 'piece'), price: KES(20) }, 'o');
      const p = pay(w, l, m, KES(20), d.offer, 'pay'); rec(w, m, 20, d.offer, {}, { answers: p.hash });
      stage(w, d, 'A3 a received that answers the transfer (row 22)'); }
    { const w = new World('26 B1'); const mama = w.person('mama'), leila = w.person('leila');
      const d = deal(w, mama, leila, kindOf('mandazi'), { quantity: amt(2, 'piece'), price: KES(20) }, 'o');
      pay(w, mama, leila, amt(2, 'piece'), d.offer, 'goods bare'); pay(w, leila, mama, KES(20), d.offer, 'cash bare');
      stage(w, d, 'B1 bare goods and bare cash, nobody answers (row 21)'); }
    { const w = new World('26 C'); const mama = w.person('mama'), leila = w.person('leila');
      const d = deal(w, mama, leila, kindOf('mandazi'), { quantity: amt(2, 'piece'), price: KES(20) }, 'o');
      const p = pay(w, leila, mama, KES(20), d.offer, 'pay'); yes(w, mama, p, 'yes 15', { amount: KES(15) });
      stage(w, d, 'C1 accepted saying 15');
      rec(w, mama, 5, d.offer); stage(w, d, 'C2 then received 5'); }
    for (const [lab, s] of [['plain yes', {}], ['yes amount 1 loaf', { amount: amt(1, 'loaf') }], ['yes covers 1 loaf', { covers: amt(1, 'loaf') }]]) {
      const w = new World('26 D ' + lab); const maria = w.person('maria'), leila = w.person('leila');
      const eggs = thing(w, leila, 'egg', amt(30, 'egg'), 'tray'); const loaf = thing(w, maria, 'loaf', null, 'loaf');
      const d = deal(w, leila, maria, eggs, { quantity: amt(12, 'egg'), price: amt(1, 'loaf') }, 'eggs for a loaf');
      const t = give(w, maria, loaf, leila, null, 'the loaf', { for: d.offer.hash }); yes(w, leila, t, 'leila ' + lab, s);
      stage(w, d, 'D a whole loaf as the price, ' + lab + ' (row 20)');
    }
    { const w = new World('26 E'); const maria = w.person('maria'), harry = w.person('harry');
      const loaf = thing(w, maria, 'loaf', amt(10, 'loaf'), 'loaves');
      const d = deal(w, maria, harry, loaf, { quantity: amt(5, 'loaf'), price: amt(5, 'GBP') }, 'priced GBP');
      pay(w, harry, maria, amt(5, 'GBP'), d.offer, 'bare 5 GBP', { after: [d.accept.hash] });
      stage(w, d, 'E1 bare 5 GBP after the accept, Maria silent (row 21)');
      const fake = thing(w, harry, 'pound coin', amt(500, 'GBP'), 'harry coins');
      const d2 = deal(w, maria, harry, loaf, { quantity: amt(5, 'loaf'), price: amt(5, 'GBP') }, 'priced GBP 2');
      give(w, harry, fake, maria, amt(5, 'GBP'), 'harry draws 5 GBP on his own thing', { for: d2.offer.hash, after: [d2.accept.hash] });
      stage(w, d2, 'E2 Harry\'s forged credit: 5 GBP drawn on his own thing (row 19)'); }
    { // row 20: a real part of Maria's own issue (her coins, a part passed to Harry and accepted) pays her price
      const w = new World('26 3c'); const maria = w.person('maria'), harry = w.person('harry');
      const loaf = thing(w, maria, 'loaf', amt(10, 'loaf'), 'loaves');
      const coins = thing(w, maria, 'maria coin', amt(500, 'GBP'), 'maria\'s issue');
      const part = give(w, maria, coins, harry, amt(20, 'GBP'), 'a part of her issue to harry'); yes(w, harry, part, 'harry accepts the part');
      const d = deal(w, maria, harry, loaf, { quantity: amt(5, 'loaf'), price: amt(5, 'GBP') }, 'priced GBP');
      give(w, harry, coins, maria, amt(5, 'GBP'), 'harry pays 5 GBP of her issue', { for: d.offer.hash, after: [d.accept.hash, part.hash] });
      stage(w, d, '3c a real part of Maria\'s issue pays her price (row 20)'); }
    { // row 21: a genuine draw on a thing of his toward a price the payee has not answered
      const w = new World('26 E3'); const mama = w.person('mama'), leila = w.person('leila');
      const d = deal(w, mama, leila, kindOf('mandazi'), { quantity: amt(2, 'piece'), price: KES(20) }, 'o');
      const purse = thing(w, leila, 'cash', KES(100), 'leila\'s counted cash');
      give(w, leila, purse, mama, KES(20), 'leila draws 20 of her cash toward the price', { for: d.offer.hash, after: [d.accept.hash] });
      stage(w, d, 'E3 a draw toward a price the payee has not answered (row 21)'); }
  } },
  { name: 'engines: prices per unit', row: '23-27', source: ST + '27 (27-scratch/engines.cjs); table rows 23 to 27', build(L) {
    const { World, kindOf, amt, put, yes, deal } = L;
    const pay = (w, p, to, amount, head, note) => put(w, p, 'transfer', { amount }, { to_owner: to.id, for: head.hash }, note);
    const K = (n) => amt(n, 'KES'), pc = (n) => amt(n, 'piece');
    function story(label, price, q, pays, { deliver = q, extra = {} } = {}) {
      const w = new World('27 ' + label); const mama = w.person('mama'), leila = w.person('leila');
      const d = deal(w, mama, leila, kindOf('mandazi'), { price, quantity: q, ...extra }, 'order');
      if (deliver) { const g = pay(w, mama, leila, deliver, d.offer, 'goods'); yes(w, leila, g, 'got'); }
      for (const [x, st2] of pays) { const p = pay(w, leila, mama, K(x), d.offer, 'pay ' + x); yes(w, mama, p, 'yes', st2 || {}); }
      const m = /\(row (\d+)\)/.exec(label);
      L.ask(w, label, 'promise_stage', [d.offer, 'held', {}], m ? { row: Number(m[1]) } : {});
    }
    story('flat 20, paid 20', K(20), pc(1), [['20']]);
    story('10 per 2, took 4, paid 20', { amount: K(10), per: pc(2) }, pc(4), [['20']]);
    story('10 per 3, took 6, paid 10 then 10', { amount: K(10), per: pc(3) }, pc(6), [['10'], ['10']]);
    story('10 per 3, took 6, paid 19', { amount: K(10), per: pc(3) }, pc(6), [['19']]);
    story('flat 20, paid 50, accept states 20', K(20), pc(1), [['50', { amount: K(20) }]]);
    story('flat 20, paid 18, covers 20', K(20), pc(1), [['18', { covers: K(20) }]]);
    story('7 per 3, took 3, paid 5 (row 23)', { amount: K(7), per: pc(3) }, pc(3), [['5']]);
    story('10 per 3, took 3, paid 7', { amount: K(10), per: pc(3) }, pc(3), [['7']]);
    story('0 per 3, took 3, paid nothing (row 24)', { amount: K(0), per: pc(3) }, pc(3), []);
    story('120 per kg, took 2500 g, paid 300 (row 25)', { amount: K(120), per: amt(1, 'kg') }, amt(2500, 'g'), [['300']], { deliver: amt(2500, 'g') });
    story('10 per 3, took 7, paid 24 (row 26)', { amount: K(10), per: pc(3) }, pc(7), [['24']]);
    const w = new World('27 terms_total');
    const tot = (label, terms, q) => L.ask(w, 'terms_total ' + label, 'terms_total', [terms, q], /row 27/.test(label) ? { row: 27 } : {});
    tot('10 per 3 x 1', { price: { amount: K(10), per: pc(3) } }, pc(1));
    tot('1 per 2^40 x 1 (40 places)', { price: { amount: K(1), per: pc('1099511627776') } }, pc(1));
    tot('1 per 2^41 x 1 (41 places, row 27)', { price: { amount: K(1), per: pc('2199023255552') } }, pc(1));
    tot('39 nines x 39 nines', { price: { amount: K('9'.repeat(39)), per: pc(1) } }, pc('9'.repeat(39)));
    tot('0.0003 per 7 x 2', { price: { amount: amt('0.0003', 'BTC'), per: pc(7) } }, pc(2));
    tot('0 per 3 x 3', { price: { amount: K(0), per: pc(3) } }, pc(3));
    tot('10 per 0 x 3', { price: { amount: K(10), per: pc(0) } }, pc(3));
  } },
  { name: 'a-fixed-bond: Joe\'s bond on a condition', row: 14, source: ST + '11 (11-scratch/a-fixed-bond.cjs, worlds A to G); table row 14 (world E)', build(L) {
    const { World, thing, put, yes, no, give } = L;
    const deadline = '2026-11-20T07:00:00.000Z';
    const world = (name) => {
      const w = new World('11 ' + name);
      const joe = w.person('joe'), amara = w.person('amara'), wanjiru = w.person('wanjiru'), sam = w.person('sam');
      const box = thing(w, joe, 'cashbox', null, 'box');
      const bond = put(w, joe, 'transfer', { condition: { without: { signal: 'arrived', by: [joe.id] }, deadline, clocks: { names: [wanjiru.id], needed: 1 } } }, { what: box.hash, to_owner: amara.id }, 'bond');
      yes(w, amara, bond, 'amara accepts');
      return { w, joe, amara, wanjiru, sam, box, bond };
    };
    const ask = (s, label) => { for (const now of [null, '2027-01-01T00:00:00.000Z']) L.ask(s.w, label + ' @' + String(now).slice(0, 4), 'ownership', [s.box, 'held', now]); };
    { const s = world('A'); put(s.w, s.joe, 'observe', { kind: 'arrived' }, {}, 'arrived'); ask(s, 'A joe arrived, wanjiru silent'); }
    { const s = world('B'); const a = put(s.w, s.joe, 'observe', { kind: 'arrived' }, {}, 'arrived'); put(s.w, s.wanjiru, 'observe', { kind: 'receipt' }, { derives_from: [a.hash] }, 'receipt'); ask(s, 'B arrived, receipted'); }
    { const s = world('C'); const a = put(s.w, s.joe, 'observe', { kind: 'arrived' }, {}, 'arrived'); put(s.w, s.wanjiru, 'observe', { kind: 'receipt' }, { derives_from: [a.hash] }, 'receipt');
      put(s.w, s.wanjiru, 'observe', { kind: 'cutoff', when: deadline }, { subject: s.bond.hash }, 'cutoff'); ask(s, 'C arrived, receipted, cutoff'); }
    { const s = world('D'); put(s.w, s.wanjiru, 'observe', { kind: 'cutoff', when: deadline }, { subject: s.bond.hash }, 'cutoff'); ask(s, 'D joe absent, cutoff'); }
    { const s = world('E'); put(s.w, s.joe, 'observe', { kind: 'arrived' }, {}, 'arrived'); no(s.w, s.amara, s.bond, 'amara no after yes'); ask(s, 'E amara declines after her yes'); }
    { const s = world('F'); put(s.w, s.joe, 'observe', { kind: 'arrived' }, {}, 'arrived');
      const back = put(s.w, s.amara, 'transfer', {}, { what: s.box.hash, to_owner: s.joe.id }, 'back'); yes(s.w, s.joe, back, 'joe yes'); ask(s, 'F amara hands back'); }
    { const s = world('G'); put(s.w, s.joe, 'observe', { kind: 'arrived' }, {}, 'arrived');
      const end = put(s.w, s.joe, 'transfer', { status: 'stopped', stop: 'before' }, { updates: s.bond.hash }, 'end');
      give(s.w, s.joe, s.box, s.sam, null, 'sale to sam', { after: [end.hash] }); ask(s, 'G joe ends the bond himself, sells'); }
  } },
  { name: 'revoke2: an accept with the giver\'s end in its past', row: 30, source: ST + '35 (35-scratch/revoke2.cjs); table row 30', build(L) {
    const { World, thing, yes, put } = L;
    for (const conditioned of [false, true]) {
      const w = new World('35 revoke ' + conditioned);
      const harry = w.person('harry'), leila = w.person('leila'), doc = w.person('doctor'), wit = w.person('witness2');
      const mill = thing(w, harry, 'mill', null, 'mill');
      const c = { signal: 'closed', by: [doc.id, wit.id].sort(), signers: 2, subject: harry.id };
      const t = put(w, harry, 'transfer', conditioned ? { condition: c } : {}, { what: mill.hash, to_owner: leila.id }, 't');
      const stop = put(w, harry, 'transfer', { status: 'stopped', stop: 'before' }, { updates: t.hash }, 'stop');
      if (conditioned) { put(w, doc, 'observe', { kind: 'closed' }, { subject: harry.id }, 'd'); put(w, wit, 'observe', { kind: 'closed' }, { subject: harry.id }, 'w'); }
      yes(w, leila, t, 'acc', {}, { after: [stop.hash] });
      for (const now of [null, '2027-01-01T00:00:00.000Z']) L.ask(w, `conditioned ${conditioned}, now ${now}`, 'ownership', [mill, 'held', now]);
    }
  } },
];
