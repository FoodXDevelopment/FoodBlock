'use strict';
// Keys and lots: a suite that falls (the twin of a hedge, a thief's suite move), a closed person's card, a will, lots sold on fresh keys with
// their headers, a resale, and a tool's grant. Each world is built by hand and asked of both engines.
const SRC = 'a world built by hand';
const path = require('path');

// a block written as if the writer held only `held` (a fork: a copy, or a forger choosing an old prev), dated on its own clock
function forkWrite(L, w, p, key, type, state, refs, held, note, after = []) {
  const b = L.fb.write(type, state, refs, { author: p.id, key, blocks: held, at: L.at(), audience: 'public', after: L.sorted(after.map((x) => x.hash)) });
  return w.add(b, note);
}
const kp = (L, w, seed, suite) => L.call('keypair', L.sha(w.name + seed), suite || null);
function personWith(w, L, label, keys) {
  const g = L.fb.identity.genesis(keys, { kind: 'person', at: '2026-11-01T00:00:00.000Z', audience: 'public' });
  w.add(g, `genesis ${label}`);
  const p = { label, keys, id: g.hash, g };
  w.people[label] = p;
  return p;
}

// lots: stock on a stock key; per sale a fresh key, a pass to it, its accept, its sale
function lotsWorld(L, stockOnMain, name) {
  const { World, amt, put, secondKey, give, yes, kindOf } = L;
  const sack = (n) => amt(n, 'sack');
  const w = new World(name || (stockOnMain ? '41 lots, stock on main key' : '41 lots, stock on its own key'));
  const harry = w.person('harry'), amara = w.person('amara'), maria = w.person('maria'), leila = w.person('leila');
  w.person('sam');
  const stockKey = stockOnMain ? null : secondKey(w, harry, 'stock key');
  const opt = stockKey ? { key: stockKey } : {};
  const S = put(w, harry, 'thing', { kind: 'flour T55 25kg', pack: sack(200) }, { of: kindOf('flour T55 25kg') }, 'stock', opt);
  const sale = (buyer, n, tag) => {
    const lot = secondKey(w, harry, `lot key for ${tag}`);
    const pass = give(w, harry, S, harry, sack(n), `pass ${n} to lot ${tag}`, {}, opt);
    const acc = yes(w, harry, pass, `lot ${tag} accepts`, {}, {}, { key: lot });
    const s = give(w, harry, S, buyer, sack(n), `lot ${tag} sells ${n}`, {}, { key: lot });
    const by = yes(w, buyer, s, `${tag} yes`);
    return { lot, pass, acc, s, by };
  };
  const m = sale(maria, 20, 'maria');
  const note = put(w, harry, 'observe', { kind: 'note', text: 'harry orders wheat' }, {}, 'harry other dealing');
  const l = sale(leila, 9, 'leila');
  const a = sale(amara, 6, 'amara');
  return { w, harry, amara, maria, S, m, l, a, note, stockKey };
}
const without = (w, bs) => { const s = new Set(bs.map((b) => b.hash)); return w.blocks.filter((b) => !s.has(b.hash)); };

module.exports = [
  { name: 'a suite that falls: the twin of the hedge, the thief\'s suite move', row: 28, source: SRC, build(L) {
    const { World, keyHash, by, confirm, keyGrant } = L;
    { const w = new World('31 A twin of the hedge');
      const harry = w.person('harry'), amara = w.person('amara'), forgerKey = L.fb.generateKeypair();
      const card = kp(L, w, 'c3', 'p256'), phoneP = kp(L, w, 'd4', 'p256');
      const voices = [{ key_hash: keyHash(card) }, { key: harry.keys.public_key_sign }];
      const before = w.blocks.slice();
      const list = keyGrant(w, harry, harry.keys, harry.id, { voices }, { updates: harry.id }, 'hedge list');
      const yes = confirm(w, harry, harry.keys, list, 'again');
      const p40 = by(w, harry, harry.keys, 'promise', { what: '100 kg flour by March' }, { to: amara.id }, 'p40', [yes]);
      L.ask(w, '2040: hedge list stands', 'stands', [list, 'blocks']);
      L.ask(w, '2040: the promise counts', 'signed_by_author', [p40, 'blocks']);
      const twin = forkWrite(L, w, harry, harry.keys, 'grant', { kind: 'key', voices: [{ key: forgerKey.public_key_sign }] }, { subject: harry.id, updates: harry.id }, before, 'forger twin');
      L.ask(w, 'twin held: hedge list stands', 'stands', [list, 'blocks']);
      L.ask(w, 'twin held: the promise counts', 'signed_by_author', [p40, 'blocks']);
      L.ask(w, 'twin held: pairs', 'fork_pairs', ['blocks']);
      L.ask(w, 'twin held: live keys', 'live_keys', [harry.id, 'blocks']);
      const move = keyGrant(w, harry, card, harry.id, { voices: [voices[0], { key: phoneP.public_key_sign, suite: 'p256' }], shown_key: card.public_key_sign }, { updates: list.hash, key: list.hash }, 'card: suite move', [p40]);
      confirm(w, harry, card, move, 'card again');
      L.ask(w, 'after move: move stands', 'stands', [move, 'blocks']);
      L.ask(w, 'after move: hedge list stands', 'stands', [list, 'blocks']);
      L.ask(w, 'after move: twin counts', 'signed_by_author', [twin, 'blocks']);
      L.ask(w, 'after move: the promise counts', 'signed_by_author', [p40, 'blocks']);
      L.ask(w, 'after move: pairs', 'fork_pairs', ['blocks']);
      L.ask(w, 'after move: live keys', 'live_keys', [harry.id, 'blocks']);
      L.ask(w, 'a reader holding only the twin: live keys', 'live_keys', [harry.id, w.blocks.filter((b) => ![list, yes, p40, move].some((x) => x.hash === b.hash) && !(b.refs && b.refs.confirms && b.refs.confirms.includes(move.hash)))]); }
    for (const [label, thiefSuite, signTwice] of [['B1 suite move', 'std', true], ['B2 same suite', 'p256', true], ['B3 suite move once', 'std', false]]) {
      const w = new World('31 ' + label);
      const cardA = kp(L, w, 'a1', 'p256'), cardB = kp(L, w, 'b1', 'p256');
      const mama = personWith(w, L, 'mama', cardA);
      const buyer = w.person('buyer');
      const voices = [{ key_hash: keyHash(cardB) }, { key: cardA.public_key_sign, suite: 'p256', wait: 'PT0S' }];
      const list = keyGrant(w, mama, cardA, mama.id, { voices }, { updates: mama.id }, 'list');
      const yes = confirm(w, mama, cardA, list, 'again');
      const fork = w.blocks.slice();
      const goat = by(w, mama, cardA, 'thing', { kind: 'goat' }, {}, 'goat', [yes]);
      const sale = by(w, mama, cardA, 'transfer', {}, { what: goat.hash, to_owner: buyer.id }, 'sale');
      w.w(buyer, 'transfer', { status: 'accepted' }, { answers: sale.hash }, 'buyer accepts');
      L.ask(w, 'before the thief: sale counts', 'signed_by_author', [sale, 'blocks']);
      const thief = thiefSuite === 'std' ? L.fb.generateKeypair() : kp(L, w, '9f', 'p256');
      const nv = [voices[0], { key: thief.public_key_sign, ...(thiefSuite === 'std' ? {} : { suite: 'p256' }), wait: 'PT0S' }];
      const tk = forkWrite(L, w, mama, cardA, 'grant', { kind: 'key', voices: nv }, { subject: mama.id, updates: list.hash }, fork, 'thief key grant', [yes]);
      if (signTwice) forkWrite(L, w, mama, cardA, 'observe', { kind: 'note' }, { confirms: [tk.hash] }, [...fork, tk], 'thief again', [tk]);
      L.ask(w, 'live keys', 'live_keys', [mama.id, 'blocks']);
      L.ask(w, 'the thief\'s key grant stands', 'stands', [tk, 'blocks']);
      L.ask(w, 'her real sale counts', 'signed_by_author', [sale, 'blocks']);
      L.ask(w, 'her real sale stands', 'stands', [sale, 'blocks']);
      L.ask(w, 'pairs', 'fork_pairs', ['blocks']);
      L.ask(w, 'owner of the goat (asked by id)', 'ownership', [goat.hash, 'blocks']);
      L.ask(w, 'owner of the goat', 'ownership', [goat, 'blocks', null]);
    }
    { const w = new World('31 C unknown hidden suite');
      const ada = w.person('ada');
      const list = w.raw(ada, 'grant', { kind: 'key', voices: [{ key_hash: 'ab'.repeat(32) }, { key: ada.keys.public_key_sign }] }, { subject: ada.id, updates: ada.id }, 'list');
      const note = w.raw(ada, 'observe', { kind: 'note' }, { key: list.hash }, 'note');
      L.ask(w, 'valid(key grant)', 'valid', [list, 'blocks']);
      L.ask(w, 'valid(her next block, naming the list)', 'valid', [note, 'blocks']); }
  } },
  { name: 'the forger\'s twin is itself a suite move', row: 29, source: SRC, build(L) {
    const { World, keyHash, by, confirm, keyGrant } = L;
    for (const order of ['harry moves first', 'forger first']) {
      const w = new World('31 s4 ' + order);
      const harry = w.person('harry'), amara = w.person('amara');
      const card = kp(L, w, 'c3', 'p256'), phoneP = kp(L, w, 'd4', 'p256'), forgerP = kp(L, w, 'e5', 'p256');
      const voices = [{ key_hash: keyHash(card) }, { key: harry.keys.public_key_sign }];
      const before = w.blocks.slice();
      const list = keyGrant(w, harry, harry.keys, harry.id, { voices }, { updates: harry.id }, 'hedge list');
      const yes = confirm(w, harry, harry.keys, list, 'again');
      const p40 = by(w, harry, harry.keys, 'promise', { what: 'flour' }, { to: amara.id }, 'p40', [yes]);
      const forgerTwin = () => {
        const t = L.fb.write('grant', { kind: 'key', voices: [{ key: forgerP.public_key_sign, suite: 'p256' }] }, { subject: harry.id, updates: harry.id }, { author: harry.id, key: harry.keys, blocks: before, at: '2041-02-01T00:00:00.000Z', audience: 'public' });
        w.add(t, 'twin');
        const c = L.fb.write('observe', { kind: 'note' }, { confirms: [t.hash] }, { author: harry.id, key: harry.keys, blocks: [...before, t], at: '2041-02-01T00:01:00.000Z', audience: 'public', after: [t.hash] }); w.add(c, 'twin again');
        const c2 = L.fb.write('observe', { kind: 'note' }, { confirms: [t.hash] }, { author: harry.id, key: forgerP, blocks: [...before, t, c], at: '2041-02-01T00:02:00.000Z', audience: 'public', after: [t.hash] }); w.add(c2, 'twin confirmed p256');
        return t;
      };
      const harryMove = () => { const mv = keyGrant(w, harry, card, harry.id, { voices: [voices[0], { key: phoneP.public_key_sign, suite: 'p256' }], shown_key: card.public_key_sign }, { updates: list.hash, key: list.hash }, 'move', [p40]); confirm(w, harry, card, mv, 'card again'); return mv; };
      let twin, mv;
      if (order.startsWith('harry')) { mv = harryMove(); twin = forgerTwin(); } else { twin = forgerTwin(); mv = harryMove(); }
      L.ask(w, 'live keys', 'live_keys', [harry.id, 'blocks']);
      L.ask(w, 'harry\'s move stands', 'stands', [mv, 'blocks']);
      L.ask(w, 'the forger\'s twin stands', 'stands', [twin, 'blocks']);
      L.ask(w, 'p40 counts', 'signed_by_author', [p40, 'blocks']);
      L.ask(w, 'pairs', 'fork_pairs', ['blocks']);
    }
  } },
  { name: 'a will holds the mill in life', row: 31, source: SRC, build(L) {
    const { World, thing, give, yes, put } = L;
    const NOW = '2027-01-01T00:00:00.000Z';
    const sig = (doc, sis, harry) => ({ signal: 'closed', by: { names: [doc.id, sis.id].sort(), needed: 2 }, subject: harry.id });
    const w = new World('35 will holds in life, clean');
    const harry = w.person('harry'), leila = w.person('leila'), sam = w.person('sam'), doc = w.person('doctor'), sis = w.person('sister');
    const mill = thing(w, harry, 'mill', null, 'the mill');
    const will = put(w, harry, 'transfer', { condition: sig(doc, sis, harry) }, { what: mill.hash, to_owner: leila.id }, 'will');
    const sale = give(w, harry, mill, sam, null, 'sale to sam'); yes(w, sam, sale, 'sam yes');
    L.ask(w, 'in life, after the sale (will unaccepted)', 'ownership', [mill, 'blocks', NOW]);
    L.ask(w, 'in life: the will stands', 'stands', [will, 'blocks']);
    yes(w, leila, will, 'leila accepts in life');
    L.ask(w, 'in life, leila accepted', 'ownership', [mill, 'blocks', NOW]);
    put(w, harry, 'transfer', { status: 'stopped', stop: 'before' }, { updates: will.hash }, 'harry stops the will after her accept');
    put(w, doc, 'observe', { kind: 'closed' }, { subject: harry.id }, 'doctor'); put(w, sis, 'observe', { kind: 'closed' }, { subject: harry.id }, 'sister');
    L.ask(w, 'after the close, will stopped after accept', 'ownership', [mill, 'blocks', NOW]);
  } },
  { name: 'a closed person\'s card', row: 'extra', source: SRC, build(L) {
    // built with the key story helpers (test/audit/key-stories): seeded keys, the oracle's signing
    const base = path.join(__dirname, '../../../test/audit/key-stories/');
    const { fb: o, World: W1, mkKey, person, Signer, day } = require(base + 'lib.cjs');
    const M = require(base + 'maria.cjs');
    const w = new W1(); w.name = '35 dead card';
    const harry = person(w, 'harry'), doctor = person(w, 'doctor'), sister = person(w, 'h-sister'), succ = person(w, 'successor'), nephew = person(w, 'nephew');
    const k1 = person(w, 'h-keeper1'), k2 = person(w, 'h-keeper2'), k3 = person(w, 'h-keeper3');
    const card = mkKey('harry-card'), phone = harry.key;
    const keepers = { names: [k1.id, k2.id, k3.id].sort(), needed: 2 };
    const wit = { names: [doctor.id, sister.id].sort(), needed: 2, wait: 'P14D' };
    const voices = [{ key_hash: o.keyHash(card.pub) }, wit, { key: phone.pub, wait: 'P30D', reach: 'P1D' }];
    const K1 = harry.write('grant', { kind: 'key', voices, clocks: keepers }, { subject: harry.id, updates: harry.id }, { at: day(0) });
    const C1 = M.confirm(harry, K1, [], day(0, 0, 1));
    const heir = person(w, 'heir');
    const G = harry.write('grant', { kind: 'successor', keys: [], scope: { types: ['observe.close', 'transfer'], parties: [heir.id] } }, { to: succ.id }, { at: day(1) });
    const cs = new Signer(w, harry.id, card, K1.hash, K1.hash);
    const show = cs.write('grant', { kind: 'key', shown_key: card.pub, voices, clocks: keepers }, { subject: harry.id, updates: K1.hash }, { at: day(1, 1), see: C1 });
    cs.kg = show.hash;
    const gc = M.confirm(cs, G, [], day(1, 2));
    const thing = harry.write('thing', { name: 'harry mill' }, {}, { at: day(2) });
    const Kw = doctor.write('grant', { kind: 'key', voices: [voices[0]], clocks: keepers }, { subject: harry.id, updates: K1.hash }, { at: day(30), see: C1 });
    M.confirm(sister, Kw, [], day(30, 0, 1));
    const cl = M.closeWait({ w, shop: k1, host: k2, aunt: k3 }, Kw, 'P14D', 14, day(30, 1));
    const d1 = M.confirm(doctor, Kw, [cl.c1, cl.c2], day(45, 5)), d2 = M.confirm(sister, Kw, [cl.c1, cl.c2], day(45, 6));
    const close = succ.write('observe', { kind: 'close' }, { subject: harry.id, under: G.hash, after: [d1.hash, d2.hash, gc.hash].sort() }, { at: day(46) });
    L.ask(w, 'the witnesses\' key grant stands', 'stands', [Kw, 'blocks']);
    for (const [n, b] of [['his list K1', K1], ['the card shows itself', show], ['the successor grant', G], ['the card confirms the successor grant', gc], ['the close', close]]) L.ask(w, 'after the close, stands: ' + n, 'stands', [b, 'blocks']);
    L.ask(w, 'identity after the close', 'identity_state', [harry.id, 'blocks']);
    const t = cs.write('transfer', { at: day(60) }, { what: thing.hash, to_owner: nephew.id, after: [close.hash] }, {});
    nephew.write('transfer', { at: day(60, 1), status: 'accepted' }, { answers: t.hash, after: [t.hash] }, {});
    L.ask(w, 'the card\'s transfer after the close: signed_by_author', 'signed_by_author', [t, 'blocks']);
    L.ask(w, 'the card\'s transfer after the close: stands', 'stands', [t, 'blocks']);
    L.ask(w, 'the mill after the close', 'ownership', [thing, 'blocks', null]);
  } },
  { name: 'lots: a buyer of one lot, holding less', row: 32, source: SRC, build(L) {
    const { World, amt, put, thing, give, yes } = L;
    const sack = (n) => amt(n, 'sack');
    { const w = new World('41 plain');
      const harry = w.person('harry'), amara = w.person('amara'), maria = w.person('maria'), leila = w.person('leila');
      const stock = thing(w, harry, 'flour T55 25kg', sack(200), 'stock');
      const toMaria = give(w, harry, stock, maria, sack(20), 'to maria'); const my = yes(w, maria, toMaria, 'maria yes');
      const buy = put(w, harry, 'observe', { kind: 'note', text: 'harry orders wheat' }, {}, 'note');
      const toLeila = give(w, harry, stock, leila, sack(9), 'to leila'); const ly = yes(w, leila, toLeila, 'leila yes');
      give(w, harry, stock, amara, sack(6), 'to amara'); yes(w, amara, w.find('to amara'), 'amara yes');
      L.ask(w, 'every block held', 'ownership', [stock, 'blocks', null]);
      L.ask(w, 'Amara holds her own, not the other sales nor his note', 'ownership', [stock, without(w, [toMaria, toLeila, buy, my, ly]), null]);
      L.ask(w, 'not the buyers\' yeses', 'ownership', [stock, without(w, [my, ly]), null]);
      L.ask(w, 'read_whole without the others', 'read_whole', [w.find('to amara').hash, stock.hash, without(w, [toMaria, toLeila, buy, my, ly])]); }
    for (const stockOnMain of [true, false]) {
      const { w, S, m, l, a, note } = lotsWorld(L, stockOnMain);
      L.ask(w, 'every block held', 'ownership', [S, 'blocks', null]);
      L.ask(w, 'not the other lots\' sales', 'ownership', [S, without(w, [m.s, m.by, l.s, l.by]), null]);
      L.ask(w, 'nor his note', 'ownership', [S, without(w, [m.s, m.by, l.s, l.by, note]), null]);
      L.ask(w, 'nor the other lots\' accepts', 'ownership', [S, without(w, [m.s, m.by, l.s, l.by, note, m.acc, l.acc]), null]);
      L.ask(w, 'nor the other lots\' key grants', 'ownership', [S, without(w, [m.s, m.by, l.s, l.by, note, m.acc, l.acc, w.find('lot key for maria'), w.find('lot key for maria (signed again)'), w.find('lot key for leila'), w.find('lot key for leila (signed again)')]), null]);
      if (!stockOnMain) {
        const held = without(w, [m.s, m.by, l.s, l.by, note, m.acc, l.acc]);
        L.ask(w, 'read_whole of the lot line', 'read_whole', [a.s.hash, a.acc.hash, held]);
        L.ask(w, 'read_whole of the stock line', 'read_whole', [a.pass.hash, S.hash, held]);
      }
    }
    { const { w, S, a, harry } = lotsWorld(L, false, '41 D a lot sells twice');
      const again = give(w, harry, S, w.people.leila, amt(6, 'sack'), 'lot amara sells again', {}, { key: a.lot });
      L.ask(w, 'Leila holds everything', 'ownership', [S, 'blocks', null]); void again; }
  } },
  { name: 'headers: the blocks Amara need not read, held as headers', row: 34, source: SRC, build(L) {
    const { header } = L;
    const { w, S, m, l, a, note } = lotsWorld(L, false, '41 headers');
    const run = (label, asHeader, drop) => {
      const hs = new Set(asHeader.map((b) => b.hash)), ds = new Set(drop.map((b) => b.hash));
      L.ask(w, label, 'ownership', [S, w.blocks.filter((b) => !ds.has(b.hash)).map((b) => (hs.has(b.hash) ? header(b) : b)), null]);
    };
    const sales = [m.s, m.by, l.s, l.by];
    run('A other sales dropped, his note a header', [note], sales);
    run('B and the other lots\' key grants as headers', [note, w.find('lot key for maria'), w.find('lot key for maria (signed again)'), w.find('lot key for leila'), w.find('lot key for leila (signed again)')], sales);
    run('C and the other lots\' accepts dropped', [note], [...sales, m.acc, l.acc]);
    run('D and the earlier passes as headers', [note, m.pass, l.pass], [...sales, m.acc, l.acc]);
    const ds = new Set(sales.map((x) => x.hash));
    const held = w.blocks.filter((b) => !ds.has(b.hash)).map((b) => (b.hash === note.hash ? header(b) : b));
    const g = w.find('lot key for amara');
    for (const [n, b] of [['amara lot key grant', g], ['its signed again', w.find('lot key for amara (signed again)')], ['amara lot accept', a.acc], ['amara sale', a.s]]) L.ask(w, 'A stands: ' + n, 'stands', [b, held]);
    L.ask(w, 'A read_whole of the main line', 'read_whole', [g.hash, w.people.harry.g.hash, held]);
  } },
  { name: 'resale: one unrelated block of Amara\'s missing', row: 33, source: SRC, build(L) {
    const { put, give, yes, amt } = L;
    const { w, S, m, l } = lotsWorld(L, false, '41 resale');
    const amara = w.people.amara, maria = w.people.maria;
    const priv = put(w, amara, 'observe', { kind: 'note', text: 'amara pays her rent' }, {}, 'amara other dealing');
    const re = give(w, amara, S, maria, amt(3, 'sack'), 'resale'); yes(w, maria, re, 'maria yes');
    L.ask(w, 'Maria holds everything but the other lots\' sales', 'ownership', [S, without(w, [m.s, m.by, l.s, l.by]), null]);
    L.ask(w, 'and not Amara\'s rent note', 'ownership', [S, without(w, [m.s, m.by, l.s, l.by, priv]), null]);
  } },
  { name: 'tool: a till sells under Harry\'s grant', row: 13, source: SRC, build(L) {
    const { World, amt, put, thing, yes } = L;
    const w = new World('08 tool');
    const harry = w.person('harry'), amara = w.person('amara'), till = w.person('till', 'machine');
    const l7 = thing(w, harry, 'flour', amt(10, 'sack'), 'L7');
    for (const variant of ['with what', 'no what']) {
      const g = put(w, harry, 'grant', { kind: 'tool', scope: { types: ['transfer', 'promise'], parties: [amara.id], limit: amt(10, 'sack') } }, { to: till.id, ...(variant === 'with what' ? { what: l7.hash } : {}) }, 'grant ' + variant);
      yes(w, till, g, 'till accepts ' + variant);
      const t = put(w, till, 'transfer', {}, { what: l7.hash, to_owner: amara.id, under: g.hash }, 'till transfer ' + variant);
      L.ask(w, variant + ': ownership', 'ownership', [l7, 'blocks', null]);
      L.ask(w, variant + ': backed', 'backed', [t, harry.id, 'blocks']);
      L.ask(w, variant + ': gives', 'gives', [t, harry.id, 'blocks']);
      put(w, harry, 'grant', { status: 'stopped' }, { updates: g.hash }, 'stop ' + variant);
      L.ask(w, variant + ': after Harry stops the grant', 'ownership', [l7, 'blocks', null]);
    }
  } },
];
