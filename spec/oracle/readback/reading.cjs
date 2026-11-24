'use strict';
// spec/readings/readback (readings/readback.md), as the oracle reads it. Not normative: a reading, named by the SHA-256 of this file's bytes.
// readback(forBlock, blocks, viewer) -> the answer. It reads typed fields and the engine's own ops only (fb.door), never free text, and classifies nothing.
// The answer names every block it read (`read`, sorted ids) and what it lacks (`lacks`), so a second reader holding `read` makes the same answer.
// `viewer` is the id of the person it is read back to (the readback's `refs.to`): the renderer reads the answer only, so "you" must be in it (the text does not say; read so).
const fb = require('../fb.cjs');
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const list = v => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const isAmt = v => isObj(v) && isStr(v.value) && isStr(v.unit);
const kindKey = a => JSON.stringify([a.unit, a.of === undefined ? null : a.of]);
// exact decimal compare of two value strings
function dcmp(a, b) {
  const sp = s => { const [i, f = ''] = s.split('.'); return [i, f]; };
  const [ai, af] = sp(a), [bi, bf] = sp(b), n = Math.max(af.length, bf.length);
  const A = BigInt(ai + af.padEnd(n, '0')), B = BigInt(bi + bf.padEnd(n, '0'));
  return A < B ? -1 : A > B ? 1 : 0;
}
const ends = v => (isObj(v) && ('min' in v || 'max' in v) ? [v.min, v.max].filter(x => x !== undefined) : isObj(v) && Array.isArray(v.one_of) ? v.one_of : v === undefined ? [] : [v]);
const byText = (a, b) => { const x = typeof a === 'string' ? a : JSON.stringify(a), y = typeof b === 'string' ? b : JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; };
// ids first (ascending), then the entries, each by its canonical text (`not_shown`, `lacks`)
const sortLacks = l => { const ids = [...new Set(l.filter(isStr))].sort(); const seen = new Set(), ent = []; for (const e of l.filter(isObj)) { const k = fb.jcs(e); if (!seen.has(k)) { seen.add(k); ent.push(e); } } ent.sort((a, b) => byText(fb.jcs(a), fb.jcs(b))); return [...ids, ...ent]; };

function readback(forBlock, blocksIn, viewer) {
  const blocks = list(blocksIn).filter(isObj);
  const byId = new Map(blocks.map(b => [b.hash, b]));
  if (!byId.has(forBlock.hash)) byId.set(forBlock.hash, forBlock);
  const all = [...byId.values()];
  const read = new Set([forBlock.hash]), lacks = [];
  const code = id => fb.door('short_code', id);
  // a person by the name she signed herself, never a name another gave her: her own `actor` block that `updates` her genesis and states `name` (a genesis carries no name);
  // of several, the one no other of them has in its past; two that do not see each other name none (the text does not say; read so)
  const person = id => {
    if (!isStr(id)) return null;
    if (id === viewer) return { id, code: code(id), name: null }; // she is "you": her own name is never read
    const own = all.filter(b => b.type === 'actor' && b.refs && b.refs.author === id && b.refs.updates === id && isStr(b.state.name) && fb.door('valid', b, all).length === 0);
    const heads = own.filter(b => !own.some(o => o !== b && fb.door('sees', o, b, all)));
    if (heads.length === 1) { read.add(heads[0].hash); pieces(heads[0], false); return { id, code: code(id), name: heads[0].state.name }; }
    for (const b of own) { read.add(b.hash); pieces(b, false); }
    return { id, code: code(id), name: null };
  };
  const signerOf = b => (b.refs && isStr(b.refs.author) ? b.refs.author : b.hash);
  // the block's pieces: its author's genesis and the key grant chain (core.md, section 8, check 5)
  // each piece given is read; each not given is lacked (the pieces `valid` reads: refs.author and refs.key, and theirs, to a genesis)
  const pieces = (b, lack) => { const seen = new Set(), stack = [b.refs.author, b.refs.key]; while (stack.length) { const id = stack.pop(); if (!isStr(id) || seen.has(id)) continue; seen.add(id); const p = byId.get(id); if (!p) { if (lack) lacks.push(id); continue; } read.add(id); if (isStr(p.refs && p.refs.author)) stack.push(p.refs.author, p.refs.key); } };
  pieces(forBlock, true);
  const answer = { viewer: person(viewer), for: { id: forBlock.hash, code: code(forBlock.hash), type: forBlock.type, signer: person(signerOf(forBlock)) } };
  // every block read is read with its pieces given (a block is someone's word only with them)
  // and with its line before it given (`prev`, to the line's start: where a draw sits on its line is read from them)
  const finish = () => {
    const done = new Set(); let more = true;
    while (more) { more = false; for (const id of [...read]) { if (done.has(id)) continue; done.add(id); more = true; const x = byId.get(id); if (!x || !isObj(x.refs)) continue; pieces(x, false); if (isStr(x.refs.prev) && byId.has(x.refs.prev)) read.add(x.refs.prev); } }
    return { ...answer, read: [...read].sort(), lacks: sortLacks(lacks) };
  };
  // who said these bytes (question 1); a block not valid is said to be so and nothing else (the text does not say; read so)
  const v = fb.door('valid', forBlock, all);
  if (v.length) {
    // pieces not given (`unmet`): she cannot yet tell who said it; it is not_shown, the pieces in `lacks`
    if (v.every(x => x.code === 'unmet')) { answer.not_shown = true; return finish(); }
    answer.not_valid = v.map(x => x.code); return finish();
  }
  // a field this reading does not read, or a rule set this reader does not run: `not_read`, and nothing else is said of the block
  const rf = fb.door('read', forBlock, all, null);
  const missingNames = rf.filter(x => x.code === 'names_missing' || x.code === 'names_unread');
  const other = rf.filter(x => !(x.code === 'names_missing' || x.code === 'names_unread'));
  if (other.length) {
    // how many fields it does not read: one `undeclared_field` each (a refusal's detail is an engine's own words and is never read)
    const fields = other.filter(x => x.code === 'undeclared_field').length;
    answer.not_read = { fields, rule_set: other.some(x => x.code === 'unknown_rules'), codes: [...new Set(other.map(x => x.code))].sort() };
    return finish();
  }
  // the ids it names for its meaning and that are not given (`needs`): lacked
  if (missingNames.length) lacks.push(...fb.door('needs', forBlock, all));
  // the ids it names for its meaning that are given are read, with their pieces (what `read` read)
  for (const id of fb.door('needs', forBlock)) if (byId.has(id)) { read.add(id); pieces(byId.get(id), false); }

  // the deal this block belongs to: a first promise is its own; an accept reads the block it answers
  let deal = forBlock;
  if (forBlock.type === 'promise' && forBlock.state.status === 'accepted' && isStr(forBlock.refs.answers)) { const d = byId.get(forBlock.refs.answers); if (d) { read.add(d.hash); deal = d; } else lacks.push(forBlock.refs.answers); }
  const terms = isObj(deal.state.terms) ? deal.state.terms : {};
  const signer = signerOf(forBlock);
  const giver = deal.type === 'promise' ? deal.refs.from : deal.type === 'transfer' ? signerOf(deal) : signer;
  const receiver = deal.type === 'promise' ? deal.refs.to : deal.type === 'transfer' ? (deal.refs.to_owner !== undefined ? deal.refs.to_owner : deal.refs.to_holder) : deal.type === 'grant' ? deal.refs.to : undefined;
  answer.to = person(receiver);
  answer.audience = Array.isArray(forBlock.state.audience) ? { readers: forBlock.state.audience.length } : 'public';

  // her own record: is there an earlier block joining her and the other side (the text does not say; read so)
  // the other side, as she reads it: the signer, or where she signed it, the side of the deal that is not hers
  const counter = deal.type === 'promise' ? [deal.refs.from, deal.refs.to].find(x => isStr(x) && x !== signer) : receiver;
  const other2 = viewer === signer ? counter : signer;
  const joins = all.filter(b => b.hash !== forBlock.hash && b.hash !== deal.hash && b.refs && isStr(other2) && isStr(viewer) && other2 !== viewer &&
    ((b.refs.author === viewer && Object.entries(b.refs).some(([k, x]) => k !== 'author' && list(x).includes(other2))) || (b.refs.author === other2 && Object.entries(b.refs).some(([k, x]) => k !== 'author' && list(x).includes(viewer)))));
  for (const b of joins) read.add(b.hash);
  answer.other = isStr(other2) && other2 !== viewer ? person(other2) : null;
  answer.first_deal = isStr(other2) && other2 !== viewer && joins.length === 0;
  answer.other_side = isStr(other2) && other2 !== viewer ? (deal.type === 'promise' ? (other2 === deal.refs.from ? 'from' : 'to') : other2 === giver ? 'from' : 'to') : null;
  // the deal's own words for what moves (`state.what`, free text): quoted as signed, every character, as its signer's; never read (2026-11-20)
  if (isStr(deal.state.what)) answer.what = { text: deal.state.what, by: person(signerOf(deal)) };

  // each line that names a thing, with the amount it states: the draw the ownership fold gives this block on it
  const things = [];
  const dealLines = deal.type === 'promise' && Array.isArray(terms.lines) ? terms.lines.filter(isObj) : [];
  const named = deal.type === 'promise' ? dealLines.filter(l => l.what !== undefined).map(l => [l.what, l.quantity]) : deal.type === 'transfer' && deal.state.status === undefined ? list(deal.refs.what).map(w => [w, deal.state.amount]) : [];
  const moneyLines = [];
  for (const [w, stated] of named.filter(([w]) => isStr(w))) {
    const t = byId.get(w);
    const line = { what: { id: w, code: code(w), name: null }, by: person(giver), to: person(receiver) };
    if (!t) { lacks.push(w); line.draw = { not_shown: true, lacks: [w] }; things.push(line); continue; }
    read.add(w);
    line.what.name = t.type === 'thing' && isStr(t.state.name) ? t.state.name : null;
    if (t.refs.of === undefined) { // a kind: a line that names no instance holds nothing
      line.draw = null; if (isAmt(stated)) line.amount = stated; things.push(line); continue;
    }
    if (isAmt(t.state.pack)) { line.what.pack = t.state.pack; line.what.stated_by = person(t.refs.author); }
    const own = fb.door('ownership', t, all);
    if (own === null) { line.draw = { not_shown: true, lacks: [w] }; lacks.push(w); things.push(line); continue; }
    for (const h of own.read || []) read.add(h); // what the fold read, shown or not
    // and every block given that answers one of those (a yes, a no, a stop: the fold reads them to say what a draw is)
    { const r0 = new Set(own.read || []); for (const x of all) if (isObj(x.refs) && isStr(x.refs.answers) && r0.has(x.refs.answers) && isStr(x.hash)) read.add(x.hash); }
    // a fold that is not shown names no `read`: every block given is read, so a second reader holding them finds the same lacks
    if (own.not_shown && !Array.isArray(own.read)) for (const x of all) if (isStr(x.hash)) read.add(x.hash);
    if (own.not_shown) { line.draw = { not_shown: true, lacks: sortLacks(own.lacks) }; lacks.push(...own.lacks); things.push(line); continue; }
    const d = (own.draws || []).find(x => x.block === forBlock.hash) || (deal !== forBlock ? (own.draws || []).find(x => x.block === deal.hash) : undefined);
    if (!d) {
      // an instance a block names but does not draw on: given only where read_whole from the block to the instance is whole
      let whole = false; try { whole = fb.door('read_whole', forBlock.hash, w, all).whole; } catch (e) { whole = false; }
      if (!whole) continue;
      line.draw = 'not_drawn'; line.owners = own.owners.map(o => ({ owner: person(o.owner), amount: o.amount || null }));
      things.push(line); continue;
    }
    line.by = person(d.by); line.to = person(d.to);
    line.draw = d.state ? { state: d.state } : d.why ? { why: d.why } : { state: null };
    const db = byId.get(d.block);
    line.holder = db && db.type === 'transfer' && isStr(db.refs.to_holder) && db.refs.to_holder !== d.to ? person(db.refs.to_holder) : null;
    // whose word frees what is kept: the one it would go to (Rule A)
    line.freer = d.state === 'held' ? person(d.to) : null;
    // a pair (two blocks of one key at one place, fork_pairs): where another block of the pair draws on this instance too, both draws are given, each with its receiver and
    // whether that receiver accepted, whatever the fold reads the draw as (never `owners: []`)
    const mates = new Set(fb.door('fork_pairs', all).filter(p => p.includes(d.block)).flat());
    const pairDraws = (own.draws || []).filter(x => mates.has(x.block));
    if (pairDraws.some(x => x.block !== d.block)) {
      const yes = h => { const ys = all.filter(b => b.refs && b.refs.answers === h && b.state.status === 'accepted' && (b.refs.author === byId.get(h).refs.to || b.refs.author === byId.get(h).refs.to_owner)); for (const y of ys) read.add(y.hash); return ys.length > 0; };
      line.pair = pairDraws.map(x => ({ draw: x.block, to: person(x.to), yes: yes(x.block) })).sort((a, b) => byText(a.draw, b.draw));
      for (const p of line.pair) read.add(p.draw);
    }
    things.push(line);
  }
  answer.things = things;

  // each amount per side and per kind: the most of hers that goes out and the least that comes in, at both ends of every range
  const sides = new Map();
  const side = id => { if (!sides.has(id)) sides.set(id, { out: new Map(), in: new Map() }); return sides.get(id); };
  const put = (m, a, most) => { const k = kindKey(a), e = m.get(k); if (!e || (most ? dcmp(a.value, e.value) > 0 : dcmp(a.value, e.value) < 0)) m.set(k, a); };
  const move = (from, to, amts) => { if (!amts.length) return; const sorted = [...amts].sort((a, b) => dcmp(a.value, b.value)); if (isStr(from)) for (const a of sorted) put(side(from).out, a, true); if (isStr(to)) for (const a of sorted) put(side(to).in, a, false); };
  if (deal.type === 'promise') {
    const qs = dealLines.flatMap(l => ends(l.quantity)).filter(isAmt);
    if (named.length || dealLines.some(l => l.quantity !== undefined)) move(deal.refs.from, deal.refs.to, qs);
    // what the deal comes to at the low and the high end of each line's price and quantity: the sum of its lines, at its `step`
    const valueOf = x => (isObj(x) && x.value !== undefined ? x.value : isObj(x) && isObj(x.amount) ? x.amount.value : undefined);
    const pick = (v, high) => { const e = [...ends(v)].sort((a, b) => dcmp(valueOf(a), valueOf(b))); return high ? e[e.length - 1] : e[0]; };
    const atEnd = high => {
      const priced = dealLines.filter(l => l.price !== undefined).map(l => { const x = { id: l.id, price: pick(l.price, high) }; const q = pick(l.quantity, high); if (q !== undefined) x.quantity = q; return x; });
      if (!priced.length) return null;
      const t = fb.door('terms_total', { lines: priced, ...(terms.step !== undefined ? { step: terms.step } : {}) }, null);
      return isAmt(t) ? t : null;
    };
    const totals = [atEnd(false), atEnd(true)].filter(Boolean).filter((t, i, a) => i === 0 || JSON.stringify(t) !== JSON.stringify(a[i - 1]));
    move(deal.refs.to, deal.refs.from, totals);
    if (totals.length) moneyLines.push({ amount: totals.sort((a, b) => dcmp(b.value, a.value))[0], by: person(deal.refs.to), to: person(deal.refs.from), draw: null });
  } else if (deal.type === 'transfer' && deal.state.status === undefined && isAmt(deal.state.amount) && named.length === 0) {
    move(giver, receiver, [deal.state.amount]);
    moneyLines.push({ amount: deal.state.amount, by: person(giver), to: person(receiver), draw: null });
  }
  const outOf = m => [...m.values()].sort((a, b) => byText(kindKey(a), kindKey(b)));
  answer.amounts = [...sides.entries()].sort((a, b) => byText(a[0], b[0])).map(([id, s]) => ({ side: person(id), out: outOf(s.out), in: outOf(s.in) }));
  answer.money = moneyLines;
  answer.terms = { waits_on: terms.waits_on === 'price' || terms.waits_on === 'goods' ? terms.waits_on : null };

  // a grant: what it can bind her to (worst_case), who must hear each deal, the floor of what it may sell for
  if (forBlock.type === 'grant' && forBlock.state.kind !== 'key') {
    const wc = fb.door('worst_case', forBlock, all);
    if (wc.not_shown) { answer.grant = { not_shown: true, lacks: wc.lacks }; lacks.push(...wc.lacks); }
    else {
      const sc = isObj(forBlock.state.scope) ? forBlock.state.scope : {};
      for (const o of wc.on) read.add(o.promise);
      for (const h of list(forBlock.refs.what)) if (byId.has(h)) read.add(h); else lacks.push(h);
      if (isStr(forBlock.refs.meter)) { if (byId.has(forBlock.refs.meter)) read.add(forBlock.refs.meter); }
      const clockOf = id => { const b = byId.get(id); if (b) read.add(id); return b && b.refs && isStr(b.refs.author) ? { block: { id, code: code(id) }, of: person(b.refs.author) } : { block: null, of: person(id) }; };
      const ck = isObj(sc.clocks) && Array.isArray(sc.clocks.names) ? sc.clocks : null;
      const names = ck ? ck.names.map(clockOf) : [];
      const needed = ck ? (Number.isInteger(ck.needed) ? ck.needed : ck.names.length) : 0;
      // the people who back the one clock: a promise of the clock's owner `for` this grant that carries `terms.backing` (FoodX's own promise, line 15) (the text does not say; read so)
      const backs = names.length === 1 ? all.filter(b => b.type === 'promise' && b.refs.for === forBlock.hash && b.refs.author === names[0].of.id && isObj(b.state.terms) && b.state.terms.backing !== undefined) : [];
      for (const b of backs) read.add(b.hash);
      const soldKinds = new Set(wc.on.filter(o => o.side === 'from').flatMap(o => ends(o.quantity === null ? undefined : o.quantity)).filter(isAmt).map(kindKey));
      const floor = [];
      for (const o of wc.on) if (o.side === 'from' && isObj(o.price) && ('min' in o.price || 'max' in o.price || Array.isArray(o.price.one_of))) { const e = ends(o.price).filter(x => isObj(x) && isAmt(x.amount)); const lo = [...e].sort((a, b) => dcmp(a.amount.value, b.amount.value))[0]; if (lo && (!('max' in o.price) || 'min' in o.price || Array.isArray(o.price.one_of))) floor.push(lo); }
      answer.grant = {
        holder: person(wc.holder), can_lose: wc.can_lose, meter_own: wc.meter === 'own', pays: wc.pays === true,
        // at_most per kind, split by side: a kind she sells as a quantity of an `on` promise is handed over; every other kind is paid
        pay_at_most: wc.at_most.filter(x => !soldKinds.has(kindKey(x))), hand_over_at_most: wc.at_most.filter(x => soldKinds.has(kindKey(x))),
        clocks: ck ? { hear: names, all: needed === names.length, one: needed === 1 && names.length === 1 } : null,
        backed_by: backs.map(b => person(b.refs.author)).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i),
        floor,
      };
    }
  }
  return finish();
}
module.exports = { readback };
