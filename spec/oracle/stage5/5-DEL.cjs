// Section 8, the deleted shapes: each is no shape of 1.9 and is refused as any undeclared field or kind is. `breached` is no stage; the successor grant and `close` observe are gone; `reading_not_run` is not a code; `invasion_shown` has lost `standing`, `crossed`, `commanded`, `accused` and `nothing`, and `up_to`.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, GBP, stage } = L;
const w = new World(), a = P(w, 'a'), b = P(w, 'b');
const find = (type, state, refs) => fb.writeFindings({ type, state, refs: { author: a.id, prev: a.id, ...refs } }, w.blocks).map(x => x.code + ':' + (x.detail || ''));
const base = { from: a.id, to: b.id };
const undeclared = terms => find('promise', { seq: 1, at: day0, audience: 'public', terms }, base).some(s => s.startsWith('undeclared_field'));
const day0 = '2026-11-01T00:00:00.000Z';
check('8', 'terms.refrain is no term', undeclared({ refrain: true, until: day0 }), true);
check('8', 'terms.notice is no term', undeclared({ notice: 'P1D' }), true);
check('8', 'terms.personal is no term', undeclared({ personal: true }), true);
check('8', 'terms.keepers is no term (clocks is)', undeclared({ keepers: { names: [a.id], needed: 1 } }), true);
check('8', 'terms.clocks is a term', undeclared({ clocks: { names: [a.id], needed: 1 } }), false);
check('8', 'terms.waits_on, step, in_hand are terms', [undeclared({ waits_on: 'price' }), undeclared({ step: A('1', 'GBP') }), undeclared({ in_hand: true })], [false, false, false]);
const unknownKind = find('observe', { seq: 1, at: day0, audience: 'public', kind: 'zzz_unknown' }, { subject: a.id });
const passKind = find('observe', { seq: 1, at: day0, audience: 'public', kind: 'pass' }, { subject: a.id });
check('8', 'an observe of kind `pass` is read as any kind that is no kind', passKind.join('|') === unknownKind.join('|'), true);
const sp = fb.P; // read from the oracle's own copy, not asked through the door: no question depends on the whole protocol.json
check('8', 'protocol.json: condition shapes add stopped and closed', ['stopped', 'closed'].map(k => sp.condition_shapes.includes(k)), [true, true]);
check('8', 'protocol.json: terms lose refrain, notice, personal', ['refrain', 'notice', 'personal'].map(k => sp.terms.includes(k)), [false, false, false]);
check('8', 'protocol.json: no `reading_not_run` refusal', JSON.stringify(sp.refusals).includes('reading_not_run'), false);
// a stage is never `breached`; outputs lose answerable, owing, passed; to_come is the output's name
{
  const w2 = new World(), s = P(w2, 's'), t = P(w2, 't');
  const o = s.write('promise', { terms: { price: GBP(1) } }, { from: s.id, to: t.id, what: kindOf(s, 'x').hash });
  yes: t.write('promise', { status: 'accepted' }, { answers: o.hash, for: o.hash });
  const st = stage(w2, o);
  check('8', 'the stage outputs: no answerable, owing, passed, owed, owed_on; to_come and to_come_on, crossed, per_accept, requests, waiting, bench', ['answerable', 'owing', 'passed', 'owed', 'owed_on', 'to_come', 'to_come_on', 'crossed', 'per_accept', 'requests', 'waiting', 'bench'].map(k => k in st), [false, false, false, false, false, true, true, true, true, true, true, true]);
}
// invasion_shown lost five fields
{
  const w3 = new World(), m = P(w3, 'm'), n = P(w3, 'n');
  const bed = kindOf(m, 'bed'), B = instance(m, bed, {});
  const claim = m.write('observe', { kind: 'invasion' }, { subject: B.hash, to: n.id, derives_from: [B.hash] });
  const r = fb.door('invasion_shown', claim, w3.blocks);
  check('8', 'invasion_shown: no standing, crossed, commanded, accused, nothing', ['standing', 'crossed', 'commanded', 'accused', 'nothing'].map(k => k in r), [false, false, false, false, false]);
}
done();
