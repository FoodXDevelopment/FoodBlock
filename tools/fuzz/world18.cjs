'use strict';
// Random worlds in the shapes stages 0 to 3 of 1.8 use today (changes-1.8/01-keys.md, 02-store.md, 03-amounts.md), the questions asked of
// them, and the metamorphic properties of part 08, section 7.2 of the 1.9 plan (P2 to P7). A world is a handful of keys and tens of blocks:
// people with lists of voices, a second device brought in by a key grant, things with a `pack`, draws (`to_owner`, part or whole, in the
// thing's unit or another), accepts, declines and stops, let-gos and first uses, makes with `state.inputs` and their outputs, deals with a
// price per unit, payments and `received`, pairs (twins that fit and twins that do not), blocks signed out of place (a `prev` that leaves
// the line, a `seq` below its `prev`, a jumped `seq`, a draw below its start), a keeper's receipts and cutoffs, sealed blocks held only as
// headers, and blocks a reader is missing. Built with lib18.cjs, so a seed replays the same bytes.
const L = require('./lib18.cjs');
const { World, fb, oracle, amt, kindOf, put, hand, pairOf, secondKey, yes, no, header } = L;
const { rng } = require('./world.cjs');
const { askAll } = require('./folds.cjs');

const UNITS = [['kg', 'kg'], ['kg', 'g'], ['sack', 'sack'], ['loaf', 'loaf'], ['kg', 'kg'], ['piece', 'piece']];
const DEC = ['1', '2', '3', '0.5', '10', '7', '2.5', '12', '0.25', '100'];

function makeWorld18(seed, size = 30) {
  const r = rng(seed);
  const w = new World('rand-' + seed);
  w.lenient = true;
  const names = ['harry', 'amara', 'leila', 'sam', 'maria'].slice(0, 3 + r.int(3));
  const people = names.map((n) => w.person(n));
  const keeper = w.person('shop');
  const devices = new Map(); // person id -> second key (a key grant and its confirm)
  const things = [], draws = [], deals = [], letGos = [];
  const pick = () => r.pick(people);
  const keyFor = (p) => (devices.has(p.id) && r.coin(0.4) ? devices.get(p.id) : null);
  const opt = (k) => (k ? { key: k } : {});
  const decimal = () => r.pick(DEC);

  // A list of voices: a card by hash above her phone key (and with a keeper clock), signed again so it stands (identity.md, Her voices)
  if (r.coin(0.4)) {
    const p = pick(), card = fb.generateKeypair();
    const voices = [{ key_hash: L.keyHash(card) }, { key: p.keys.public_key_sign, ...(r.coin(0.5) ? { wait: 'P30D' } : {}) }];
    const list = L.keyGrant(w, p, p.keys, p.id, { voices, ...(r.coin(0.5) ? { clocks: { names: [keeper.id], needed: 1 } } : {}) }, { updates: p.id }, 'list of ' + p.label);
    if (r.coin(0.85) && !list.refusedWrite) L.confirm(w, p, p.keys, list, 'list again ' + p.label);
  }
  // Two devices of one person: a second key brought in by a key grant
  for (const p of people) if (r.coin(0.35)) devices.set(p.id, secondKey(w, p, 'device of ' + p.label));

  const newThing = (p, i) => {
    const [unit] = r.pick(UNITS), whole = r.coin(0.15);
    const word = r.pick(['maize', 'flour', 'tomatoes', 'bread', 'eggs']);
    const t = put(w, p, 'thing', { kind: word, ...(whole ? {} : { pack: amt(r.pick(['1', '10', '20', '6', '100']), unit) }) }, { of: kindOf(word) }, 'thing ' + i, opt(keyFor(p)));
    if (!t.refusedWrite) things.push({ t, unit: whole ? null : unit, owner: p });
    return t;
  };
  const amountFor = (th) => {
    if (!th.unit || r.coin(0.2)) return null; // all of it
    const [u, alt] = UNITS.find(([x]) => x === th.unit) || [th.unit, th.unit];
    return amt(decimal(), r.coin(0.15) ? alt : u);
  };

  for (let i = 0; i < size; i++) {
    const act = r.int(21) === 20 ? 12 : r.int(20); // deals a little more often
    const p = pick();
    const th = things.length ? r.pick(things) : null;
    try {
      if (act <= 1 || !th) newThing(p, i);
      else if (act <= 4) { // a draw: a transfer to_owner, by the thing's first owner or a receiver of it, sometimes from a second device
        const from = r.coin(0.75) ? th.owner : p, to = r.pick(people.filter((x) => x !== from).concat([keeper]));
        const d = L.give(w, from, th.t, to, amountFor(th), 'draw ' + i, {}, opt(keyFor(from)));
        if (!d.refusedWrite) draws.push({ d, from, to, th });
      } else if (act <= 6 && draws.length) { // the receiver's yes, sometimes of part of it
        const x = r.pick(draws);
        yes(w, x.to, x.d, 'yes ' + i, r.coin(0.15) && x.d.state.amount ? { amount: amt('0.5', x.d.state.amount.unit) } : {});
      } else if (act === 7 && draws.length) { // a decline, or a stop of a yes she gave
        const x = r.pick(draws);
        if (r.coin(0.5)) no(w, x.to, x.d, 'no ' + i); else put(w, x.to, 'observe', { status: 'stopped' }, { answers: x.d.hash }, 'stop ' + i);
      } else if (act === 8) { // a pair: two blocks of one key at one place. Twins that fit (one receiver, a crash) or that do not
        const from = th.owner, k = keyFor(from) || from.keys;
        const to1 = r.pick(people.filter((x) => x !== from)), to2 = r.coin(0.4) ? to1 : r.pick(people.filter((x) => x !== from));
        const a = amountFor(th);
        const [d1, d2] = pairOf(w, from, k, ['transfer', a ? { amount: a } : {}, { what: th.t.hash, to_owner: to1.id }, 'twin A ' + i],
          r.coin(0.7) ? ['transfer', a ? { amount: a } : {}, { what: th.t.hash, to_owner: to2.id }, 'twin B ' + i] : ['observe', { kind: 'note', text: 'twin note ' + i }, {}, 'twin B ' + i]);
        draws.push({ d: d1, from, to: to1, th }); if (d2.type === 'transfer') draws.push({ d: d2, from, to: to2, th });
      } else if (act === 9) { // a block signed out of place: a seq below its prev, a prev on another line, a jumped seq, a draw below its start
        const from = th.owner, n = L.next(w, from.keys, from), to = r.pick(people.filter((x) => x !== from));
        const roll = r.int(4), stranger = r.pick(w.blocks.filter((b) => b.refs && b.refs.author && b.refs.author !== from.id && b.type)) || from.g;
        const place = roll === 0 ? { prev: n.prev, seq: Math.max(1, n.seq - 1 - r.int(3)) } : roll === 1 ? { prev: stranger.hash, seq: n.seq } : roll === 2 ? { prev: n.prev, seq: n.seq + 2 + r.int(4) } : { prev: n.prev, seq: Math.max(1, th.t.state.seq - 1) };
        const d = hand(w, from, 'transfer', {}, { what: th.t.hash, to_owner: to.id }, place, 'out of place ' + ['low seq', 'foreign prev', 'jumped seq', 'below start'][roll] + ' ' + i);
        draws.push({ d, from, to, th });
      } else if (act === 10) { // a let-go to an open receiver, then a first use that takes it (things.md, Letting go)
        const from = th.owner, a = amountFor(th);
        // the writer today wants `state.count` on a let-go; the shared ground says `amount`. Both are written, and the core's own writer decides
        const lg = put(w, from, 'transfer', { ...(a ? { amount: a } : {}), ...(r.coin(0.5) ? { count: a ? a.value : '1' } : {}) }, { what: th.t.hash }, 'let go ' + i);
        if (!lg.refusedWrite) letGos.push({ lg, th });
        if (r.coin(0.6)) put(w, r.pick(people), 'transform', {}, { subject: th.t.hash, after: [lg.hash] }, 'first use ' + i);
      } else if (act === 11) { // a make that takes part of the thing, and its output
        const from = r.coin(0.8) ? th.owner : p, a = amountFor(th);
        const mk = put(w, from, 'transform', a ? { inputs: [{ from: th.t.hash, amount: a }] } : {}, { derives_from: [th.t.hash] }, 'make ' + i, opt(keyFor(from)));
        if (!mk.refusedWrite && r.coin(0.7)) {
          const out = put(w, from, 'thing', { kind: 'bread', pack: amt(r.pick(['1', '5', '1000']), 'loaf') }, { derives_from: [mk.hash] }, 'output ' + i);
          if (!out.refusedWrite) things.push({ t: out, unit: 'loaf', owner: from });
        }
      } else if (act === 12) { // a deal with a price per unit, its accept, a payment, the payee's yes or `received`
        const seller = th.owner, buyer = r.pick(people.filter((x) => x !== seller));
        const [u] = th.unit ? [th.unit] : ['piece'];
        const price = r.coin(0.6) ? { amount: amt(r.pick(['7', '10', '0', '120', '20']), 'KES'), per: amt(r.pick(['1', '3', '2']), u) } : amt(r.pick(['20', '5']), 'KES');
        const d = L.deal(w, seller, buyer, th.t, { quantity: amt(r.pick(['3', '6', '7', '1']), u), price }, 'deal ' + i);
        deals.push(d);
        if (r.coin(0.7)) {
          const pay = put(w, buyer, 'transfer', { amount: amt(r.pick(['5', '20', '24', '300']), 'KES') }, { to_owner: seller.id, for: d.offer.hash }, 'pay ' + i);
          if (r.coin(0.6)) yes(w, seller, pay, 'paid yes ' + i, r.coin(0.2) ? { covers: amt('20', 'KES') } : {});
          if (r.coin(0.3)) put(w, seller, 'observe', { kind: 'received', amount: amt('20', 'KES') }, { for: d.offer.hash }, 'received ' + i, opt(keyFor(seller)));
        }
        if (r.coin(0.5)) { const g = L.give(w, seller, th.t, buyer, amountFor(th), 'deliver ' + i, { for: d.offer.hash }); if (!g.refusedWrite) draws.push({ d: g, from: seller, to: buyer, th }); }
      } else if (act === 13) put(w, p, 'observe', { kind: 'note', text: 'n' + i }, {}, 'note ' + i, opt(keyFor(p))); // unrelated words
      else if (act === 14) { // a keeper's clock: her receipt of a block, sometimes a cutoff over a word
        const b = r.pick(w.blocks.filter((x) => x.refs && x.refs.author && x.refs.author !== keeper.id));
        if (b) { const rc = L.receipt(w, keeper, b, 'receipt ' + i); if (r.coin(0.3) && !rc.refusedWrite) L.cutoff(w, keeper, b, rc, 'P1D', 'cutoff ' + i); }
      } else if (act === 15 && draws.length) { // a resale by a receiver
        const x = r.pick(draws), to = r.pick(people.filter((q) => q !== x.to));
        const d = L.give(w, x.to, x.th.t, to, amountFor(x.th), 'resale ' + i);
        if (!d.refusedWrite) draws.push({ d, from: x.to, to, th: x.th });
      } else if (act === 16) { // a draw on a second device sharing the genesis key, at the place the first device already used (two devices, one key)
        const from = th.owner, n = L.next(w, from.keys, from), to = r.pick(people.filter((x) => x !== from));
        const last = w.blocks.filter((b) => b.refs && b.refs.author === from.id && b.state && b.state.seq === n.seq - 1 && !b.refs.key);
        if (last.length) { const prevOf = last[0].refs.prev; const d = hand(w, from, 'transfer', {}, { what: th.t.hash, to_owner: to.id }, { prev: prevOf, seq: n.seq - 1 }, 'second device ' + i); draws.push({ d, from, to, th }); }
      } else if (act === 17 && draws.length) { // a second yes to one draw (from her other device, or stating less)
        const x = r.pick(draws);
        yes(w, x.to, x.d, 'yes again ' + i, x.d.state.amount ? { amount: amt('0.4', x.d.state.amount.unit) } : {}, {}, opt(keyFor(x.to)));
      } else if (act === 18 && draws.length) { // a stop of her own draw by its signer
        const x = r.pick(draws);
        put(w, x.from, 'transfer', { status: 'stopped', stop: 'before' }, { updates: x.d.hash }, 'withdraw ' + i);
      } else newThing(p, i);
    } catch (e) { if (process.env.WORLD_DEBUG) console.error('world18:', e.stack); }
  }
  const blocks = w.blocks.filter((b) => b && b.hash && b.type);
  // A stranger, built on the same clock and then held apart: his blocks name nothing of the world (P3).
  const n0 = w.blocks.length;
  const s1 = w.person('stranger'), s2 = w.person('stranger2');
  const st = L.thing(w, s1, 'maize', amt('5', 'kg'), 'stranger thing');
  put(w, s1, 'observe', { kind: 'note', text: 'stranger note' }, {}, 'stranger note');
  const sd = L.give(w, s1, st, s2, amt('2', 'kg'), 'stranger sale');
  yes(w, s2, sd, 'stranger yes');
  const strangers = w.blocks.slice(n0);
  w.blocks.length = n0;
  return { w, r, people, keeper, devices, things, draws, deals, letGos, blocks, strangers };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
// Blocks held only as their headers (a sealed body this reader was not shown), and blocks missing: a reader holding less.
function lesser(r, blocks, keep) {
  const keepSet = new Set(keep.map((b) => b.hash));
  const out = [];
  for (const b of blocks) {
    if (keepSet.has(b.hash) || b.type === 'actor' && !b.refs.author) { out.push(b); continue; }
    const roll = r.next();
    if (roll < 0.1) continue; // missing
    if (roll < 0.2 && b.refs && b.refs.author) { out.push(header(b)); continue; } // held as its header
    out.push(b);
  }
  return out;
}

// The questions (P1: core = oracle) and the property checks of one world.
function casesOf18(seed, size) {
  const g = makeWorld18(seed, size), { w, r, blocks } = g;
  const cases = [];
  const add = (op, args) => cases.push({ op, args: clone(args), world: seed });
  const ids = blocks.map((b) => b.hash);
  // every block: valid and read over what was held before it, and its canonical text
  for (const b of blocks) {
    const before = blocks.slice(0, blocks.indexOf(b));
    add('valid', [b, before]);
    if (b.refs && b.refs.author) add('read', [b, blocks]);
    if (r.coin(0.25)) add('strict_text', [oracle.canonOf({ type: b.type, state: b.state, refs: b.refs })]);
  }
  // mutated blocks, re-signed and not: the order of valid's checks
  const { mutate } = require('./world.cjs');
  for (const b of r.shuffle(blocks).slice(0, 12)) {
    const body = mutate(r, { type: b.type, state: b.state, refs: b.refs }, ids);
    const p = g.people.concat([g.keeper]).find((x) => x.id === (b.refs && b.refs.author));
    if (p && b.refs.author && !b.refs.key) { try { const c = fb.create(body.type, body.state, body.refs); add('valid', [{ ...c, signature: fb.sign(c, p.keys.private_key) }, blocks]); } catch { /* unsignable */ } }
    add('valid', [{ ...b, ...body }, blocks]);
    add('valid', [{ ...b, hash: r.hex(64), signature: r.hex(128) }, blocks]);
    add('strict_text', [JSON.stringify(body)]);
    // a header that is not the signed header, and a header held for a body
    if (b.refs && b.refs.author) { const h = header(b); add('valid', [h, blocks]); add('valid', [{ ...h, header: { ...h.header, seq: (h.header.seq || 0) + 1 } }, blocks]); }
  }
  // every fold of protocol.json over the whole world, then over a lesser holding (headers and gaps)
  for (const q of askAll(blocks)) add(q.op, q.args);
  const things = g.things.map((x) => x.t).filter((t) => t && t.hash);
  const less = lesser(r, blocks, things);
  for (const t of things) { add('ownership', [t, less, null]); add('where_now', [t, less]); }
  for (const d of g.deals) add('promise_stage', [d.offer, less, {}]);
  // where each key's blocks sit: check_chain, read_whole back to its genesis, next_link, fork_pairs over all and over headers
  for (const p of g.people) {
    const mine = blocks.filter((b) => b.refs && b.refs.author === p.id);
    add('check_chain', [[p.g, ...mine], p.id]);
    const last = mine[mine.length - 1];
    if (last) { add('read_whole', [last.hash, p.id, blocks]); add('read_whole', [last.hash, p.id, less]); }
  }
  for (const x of g.draws.slice(0, 8)) add('read_whole', [x.d.hash, x.th.t.hash, blocks]);
  add('fork_pairs', [blocks]);
  add('fork_pairs', [blocks.map((b) => (b.refs && b.refs.author && r.coin(0.5) ? header(b) : b))]);
  // a push: some blocks, some as headers, into a store that holds some of the rest
  for (let k = 0; k < 3; k++) {
    const held = blocks.filter((b) => (b.type === 'actor' && !b.refs.author) || r.coin(0.4));
    const has = new Set(held.map((b) => b.hash));
    const inc = r.shuffle(blocks.filter((b) => !has.has(b.hash))).map((b) => (b.refs && b.refs.author && r.coin(0.2) ? header(b) : b));
    for (const takes_pairs of [false, true]) add('accept', [inc, held, { takes_pairs }]);
    add('accept', [[...inc, ...inc.slice(0, 2)], held, { takes_pairs: true }]); // one hash twice in one push
  }
  // a header passed as a signed message (security 01 M2)
  for (const b of r.shuffle(blocks.filter((x) => x.refs && x.refs.author)).slice(0, 2)) {
    const p = g.people.find((x) => x.id === b.refs.author);
    if (p) add('verify_message', [{ ...fb.header(b), signature: b.signature }, p.keys.public_key_sign]);
  }
  // amounts: the terms of each deal
  for (const d of g.deals) if (d.offer.state && d.offer.state.terms) add('terms_total', [d.offer.state.terms, d.offer.state.terms.quantity]);
  return { cases: cases.filter((c) => !/\\ud[89a-f][0-9a-f]{2}/i.test(JSON.stringify(c))), props: propsOf(g) };
}

// ---- the properties (part 08, 7.2). Each check is (ask) => [{ name, detail, held }] where ask(op, args) is one engine's answer.
const ownersOf = (o) => (o && !o.not_shown && Array.isArray(o.owners) ? o.owners.map((x) => `${x.owner}:${x.amount && x.amount.value !== undefined ? x.amount.value : ''}`).sort() : null);
const canonJ = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((q) => [q, v[q]])) : v));
function propsOf(g) {
  const { r, blocks, strangers } = g;
  const props = [];
  const things = g.things.map((x) => x.t).filter((t) => t && t.hash);
  // subjects: (held) => [op, args]
  const subjects = [];
  for (const t of things) { subjects.push({ op: 'ownership', subject: t, args: (h) => [t, h, null] }); subjects.push({ op: 'where_now', subject: t, args: (h) => [t, h] }); subjects.push({ op: 'made_from', subject: t, args: (h) => [t, h] }); }
  for (const d of g.deals) subjects.push({ op: 'promise_stage', subject: d.offer, args: (h) => [d.offer, h, {}] });
  for (const x of g.draws.slice(0, 6)) subjects.push({ op: 'stands', subject: x.d, args: (h) => [x.d, h] });
  for (const s of subjects) {
    const base = blocks;
    // P2. Order: the blocks held, shuffled
    props.push({ p: 'P2', what: 'order', s, base, variant: (h) => r.shuffle(h) });
    // P3. Unrelated blocks: a stranger's line, which names nothing of the world
    props.push({ p: 'P3', what: 'unrelated blocks', s, base, variant: (h) => [...h, ...strangers] });
    // P6. Twice is once: one block held twice
    const twice = r.pick(blocks);
    props.push({ p: 'P6', what: 'a block held twice', s, base, variant: (h) => (h.some((b) => b.hash === twice.hash) ? [...h, twice] : h) });
    // P4. Less, never otherwise: one block dropped, or held as its header (not the subject, not a genesis)
    if (s.op === 'ownership') {
      // only blocks on the lines the thing is drawn along (its maker's, and each drawer's): a receiver's own yes is her line, not the measure's
      const lines = new Set([s.subject.refs.author, ...g.draws.filter((x) => x.th.t.hash === s.subject.hash).map((x) => x.from.id)]);
      const cands = blocks.filter((b) => b.hash !== s.subject.hash && b.refs && lines.has(b.refs.author));
      const onIt = cands.filter((b) => b.type === 'transfer' && [].concat(b.refs.what || []).includes(s.subject.hash));
      const chosen = [...new Set([...r.shuffle(onIt).slice(0, 3), ...r.shuffle(cands).slice(0, 2)])];
      for (const x of chosen) {
        // a block is missing to a reader only where a block she holds names it as its prev; the last block of a line leaves no trace
        if (blocks.some((b) => b.refs && b.refs.prev === x.hash)) props.push({ p: 'P4', what: 'one block missing', s, base, dropped: x.hash, variant: (h) => (h.some((b) => b.refs && b.refs.prev === x.hash) ? h.filter((b) => b.hash !== x.hash) : h) });
        props.push({ p: 'P4', what: 'one block held as its header', s, base, dropped: x.hash, variant: (h) => h.map((b) => (b.hash === x.hash ? header(b) : b)) });
      }
    }
  }
  return { props, things };
}

// One engine's check of one property: the answer over the base and over the variant. Returns null or a break { detail }.
function checkProp(pr, ask, held) {
  const a = ask(pr.s.op, pr.s.args(held));
  if (a.error) return null; // a question the engine does not answer has no property to keep (P1 compares the error)
  const vh = pr.variant(held);
  if (vh === held) return null;
  const b = ask(pr.s.op, pr.s.args(vh));
  if (b.error) return { detail: `${pr.s.op}: answers over the base, ${b.error}${b.code ? ' ' + b.code : ''} over the variant` };
  const A = a.ok, B = b.ok;
  if (pr.p === 'P4') {
    if (B && B.not_shown) return null; // less: not shown
    const oa = ownersOf(A), ob = ownersOf(B);
    if (oa && ob && canonJ(oa) !== canonJ(ob)) return { detail: `${pr.s.op}: another owner named once a block is ${pr.what === 'one block missing' ? 'missing' : 'a header'}` };
    return null;
  }
  if (canonJ(A) !== canonJ(B)) return { detail: `${pr.s.op}: ${require('./diff.cjs').firstDiff(A, B, '', 'base', 'variant')}` };
  return null;
}
// P5 and P7, read from one answer: never "nobody" where a signed accepted transfer names someone; the owners hold no more than the start.
function checkAnswer(op, args, ans) {
  if (op !== 'ownership' || !ans || ans.error || !ans.ok || ans.ok.not_shown) return [];
  const o = ans.ok, t = args[0], held = args[1];
  const out = [];
  if (Array.isArray(o.owners) && o.owners.length === 0) {
    const named = held.filter((b) => b && b.type === 'transfer' && b.refs && [].concat(b.refs.what || []).includes(t.hash) && b.refs.to_owner && held.some((y) => y && y.refs && y.refs.answers === b.hash && y.refs.author === b.refs.to_owner && y.state && y.state.status === 'accepted'));
    if (named.length) out.push({ p: 'P5', detail: `ownership: owners [] while ${named.length} signed transfer(s) accepted by their receiver name someone` });
  }
  const pack = t.state && t.state.pack;
  if (pack && Array.isArray(o.owners)) {
    const sum = o.owners.reduce((s, x) => s + (x.amount && x.amount.unit === pack.unit && (x.amount.of || null) === (pack.of || null) ? Number(x.amount.value) : 0), 0);
    if (sum > Number(pack.value) + 1e-9) out.push({ p: 'P7', detail: `ownership: owners hold more than the pack (${'N'} of ${'N'})` });
  }
  return out;
}

module.exports = { makeWorld18, casesOf18, checkProp, checkAnswer, lesser };
