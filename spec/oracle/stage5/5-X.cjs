// Extra cases the owner named.
// X1 A deposit that is a thing, held on the condition `{ stopped: deal, side }` (R-C2, R-P9): the café's table C1 (£60) with a deposit E (£20, a thing Leila owns) handed `for` C1 on `{ stopped: C1, side: "to" }`. World A: Leila stops first: E lands with the café. World B: the café stops first: E never lands (held, Leila's own to free); crossing stops: not kept.
// X2 `{ closed: <id> }`: holds for a block where a key grant that leaves no voice of that id's list stands in its causal past; not before. A will is her own transfer on it, takes at the close, in the order of her line; two wills on one thing: the earlier on her line takes, the later finds it gone.
// X3 A successor gets what was hers only by her own transfer on the condition of her close: no `successor` grant is read; at her close what she never willed stays hers (no one takes it); no heir clause.
// X4 A machine identity handed over to her key: the machine's own first voice signs a key grant that names her key as its voice; her key then speaks for the machine's id and the maker's old key does not.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, day, yes, mkKey } = L;
const dr = (r, ...tags) => drawsOf(r).filter(x => tags.includes(x[0])).map(x => x.slice(0, 4));
function x1(who) {
  const w = new World(), cafe = P(w, 'cafe'), leila = P(w, 'leila');
  const c1 = T(cafe.write('promise', { what: 'a table for two Friday 19:30', terms: { price: GBP(60) } }, { from: cafe.id, to: leila.id }), 'C1');
  const ac = T(leila.write('promise', { status: 'accepted' }, { answers: c1.hash, for: c1.hash }), 'LA');
  const K = kindOf(leila, 'deposit'), E = T(instance(leila, K, { pack: GBP(20) }), 'E');
  const dep = T(leila.write('transfer', { condition: { stopped: c1.hash, side: 'to' } }, { what: E.hash, to_owner: cafe.id, for: c1.hash }), 'DEP');
  cafe.write('transfer', { status: 'accepted' }, { answers: dep.hash, for: c1.hash });
  if (who === 'leila') leila.write('promise', { status: 'stopped', stop: 'onward' }, { updates: ac.hash });
  else if (who === 'cafe') cafe.write('promise', { status: 'stopped', stop: 'onward' }, { answers: ac.hash, for: c1.hash });
  else { const x = cafe.make('promise', { status: 'stopped', stop: 'onward' }, { answers: ac.hash, for: c1.hash }); leila.write('promise', { status: 'stopped', stop: 'onward' }, { updates: ac.hash }); w.add(x); }
  return { w, E };
}
for (const [who, want] of [['none', 'held'], ['leila', 'landed'], ['cafe', 'held'], ['both', 'held']]) {
  const { w, E } = x1(who);
  check('X1', who === 'none' ? 'no stop yet: E held' : who + ' stops: E ' + want, dr(own(w, E), 'DEP').map(x => x[3]), [want]);
}
{
  const w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila'), sam = P(w, 'sam'), wan = P(w, 'wanjiru'), kinA = P(w, 'kinA'), kinB = P(w, 'kinB');
  const kin = { names: [kinA.id, kinB.id].sort(), needed: 2, wait: 'P30D', above: true }, clocks = { names: [wan.id], needed: 1 };
  const K0 = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, kin], clocks }, { subject: harry.id, updates: harry.id });
  const Kd = kindOf(harry, 'mill'), X = T(instance(harry, Kd, {}), 'X'), Y = T(instance(harry, Kd, {}), 'Y');
  const cond = { closed: harry.id };
  check('X2', 'before the close the condition does not hold', fb.door('condition_holds', cond, w.blocks), false);
  const h1 = T(harry.write('transfer', { condition: cond }, { what: X.hash, to_owner: leila.id }, { at: day(1) }), 'H1');
  leila.write('transfer', { status: 'accepted' }, { answers: h1.hash });
  const h2 = T(harry.write('transfer', { condition: cond }, { what: X.hash, to_owner: sam.id }, { at: day(2) }), 'H2');
  sam.write('transfer', { status: 'accepted' }, { answers: h2.hash });
  const close = T(kinA.write('grant', { kind: 'key', voices: [], clocks }, { subject: harry.id, updates: K0.hash }), 'CLOSE');
  kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash });
  const r1 = wan.write('observe', { kind: 'receipt' }, { derives_from: [close.hash] });
  const cut = wan.write('observe', { kind: 'cutoff', when: 'P30D' }, { subject: close.hash, derives_from: [r1.hash] }, { at: day(40) });
  kinA.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  check('X2', 'the close stands: the condition holds; two wills on one thing: the earlier on her line (H1) takes, H2 finds it gone', [fb.door('condition_holds', cond, w.blocks), dr(own(w, X), 'H1', 'H2').sort((a, b) => (a[0] < b[0] ? -1 : 1)), ownersOf(own(w, X))], [true, [['H1', true, null, 'landed'], ['H2', false, 'past', null]], { owners: [['leila', null]] }]);
  check('X3', 'what she never willed stays hers: nobody takes Y', [ownersOf(own(w, Y))], [{ owners: [['harry', null]] }]);
  // no successor: a grant of kind `successor` and a `close` observe by someone else give no power and close no one (a successor gets what was hers only by her own transfer on her close)
  const succ = T(harry.write('grant', { kind: 'successor', scope: { types: ['transfer'] } }, { to: leila.id }), 'SUCC');
  const Z = T(instance(harry, Kd, {}), 'Z');
  const take = T(leila.write('transfer', {}, { what: Z.hash, to_owner: leila.id, under: succ.hash }), 'TAKE');
  check('X3', 'a successor grant lets no one act for her: the block under it is under no grant', fb.door('under_ok', take, w.blocks), false);
  const cl = leila.write('observe', { kind: 'close' }, { subject: harry.id, under: succ.hash });
  const w5 = new World(), h5 = P(w5, 'h5'), l5 = P(w5, 'l5');
  const Z5 = T(instance(h5, kindOf(h5, 'mill'), {}), 'Z5');
  const cl5 = l5.write('observe', { kind: 'close' }, { subject: h5.id });
  check('X3', 'a `close` observe by someone else closes no one: her list is not closed, `{ closed }` does not hold', [fb.door('identity_state', h5.id, w5.blocks).closed === true, fb.door('condition_holds', { closed: h5.id }, w5.blocks)], [false, false]);
}
{
  const w = new World(), maker = P(w, 'maker'), maria = P(w, 'maria'), sam = P(w, 'sam');
  const mk = mkKey('machine'), M = P(w, 'machine');
  // the machine M has its own genesis key; its first voice (its genesis key) signs a key grant whose list names Maria's key
  const hand = M.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }] }, { subject: M.id, updates: M.id });
  const viaMaria = M.asKey(maria.key, hand.hash);
  const blockByHer = T(viaMaria.write('observe', { kind: 'note', text: 'mine' }, { subject: M.id }, { key: undefined }), 'BYHER');
  const keys = fb.door('live_keys', M.id, w.blocks);
  check('X4', 'after the hand-over the machine\'s id speaks only through her key', [keys.includes(maria.key.pub), keys.includes(M.key.pub)], [true, false]);
  const late = T(M.write('observe', { kind: 'note', text: 'late' }, { subject: M.id }), 'LATE');
  const sba = fb.door('identity_state', M.id, w.blocks).signed_by_author;
  check('X4', 'her block for the machine stands; the old key\'s block after the hand-over does not', [sba[blockByHer.hash], sba[late.hash]], [true, false]);
}
done();
