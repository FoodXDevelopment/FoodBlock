// O2 (stage 6 owner decision, 2026-11-19): a grant's own ending term `scope.ends_on: { witness, said }`. The grant counts for nothing for every block that has in its causal
// past a counted observe of kind witness by the host it names, saying exactly its text, `for` the grant (with the grant's own handle, where it states one): read in causal order,
// as her own stop is. Not compared by narrower_than. Mama grants Pesa (her tool) types [promise], ends_on { witness: Hosti, said: "STOP" }.
const L = require('./lib.cjs'); const { fb, World, P, T, check, done, A, GBP, per, grant, kindOf } = L;
const readCodes = (b, w) => fb.readFindings(b, w.blocks).map(x => x.code);
function world(o = {}) {
  const w = new World(), mama = P(w, 'mama'), pesa = P(w, 'pesa'), hosti = P(w, 'hosti'), other = P(w, 'otherhost'), seller = P(w, 'seller');
  const maize = kindOf(mama, 'maize');
  // Mama's want of maize; G names it in `on` and the seller in `parties`; Pesa's order keeps to it (stage 4, Keeps to)
  const A1 = T(mama.write('promise', { terms: { quantity: { max: A('10', 'sack') }, price: { max: per(35, 'GBP', 'sack') } } }, { to: mama.id, what: maize.hash }), 'A1');
  const G = T(grant(mama, pesa, { types: ['promise'], on: [A1.hash], parties: [seller.id], limit: GBP(200), ends_on: { witness: hosti.id, said: 'STOP' } }, { meter: pesa.id }, o.handle ? { handle: o.handle } : {}), 'G');
  const order = (tag, refs = {}) => T(pesa.write('promise', { terms: { quantity: A('2', 'sack'), price: per(30, 'GBP', 'sack') }, draws: { grant: G.hash, amount: GBP(60) } }, { from: seller.id, to: mama.id, what: maize.hash, for: A1.hash, under: G.hash, ...refs }), tag);
  const witness = (host, said, handle, refs = {}) => T(host.write('observe', { kind: 'witness', said, ...(handle ? { handle } : {}), readback: fb.sha256 ? fb.sha256(said) : require('crypto').createHash('sha256').update(said).digest('hex') }, { for: G.hash, ...refs }), 'WIT');
  return { w, mama, pesa, hosti, other, seller, G, order, witness };
}
const why = (b, w) => fb.door('why_not_under', b, w.blocks).map(x => x.code);
{
  const { w, mama, pesa, hosti, G, order, witness } = world();
  check('O2', 'a grant with scope.ends_on { witness, said } is read; scope_reading reads it as no junk', [readCodes(G, w), fb.door('scope_reading', G.state.scope).junk], [[], []]);
  const O1 = order('O1');
  check('O2', 'Pesa\'s order under it counts for Mama', [why(O1, w), fb.door('speaks_for', O1, w.blocks) === mama.id], [[], true]);
  const Wt = witness(hosti, 'STOP', 'mama-1', { after: [O1.hash] });
  const O3 = order('O3', { after: [O1.hash] }); // signed before Pesa's line has seen the witness
  const O2 = order('O2', { after: [Wt.hash] });
  check('O2', 'Hosti\'s witness `for` the grant saying "STOP": Pesa\'s next order, with the witness in its past, counts for nothing (it speaks for Pesa alone; not_live)', [fb.door('speaks_for', O2, w.blocks) === pesa.id, why(O2, w)], [true, ['not_live']]);
  check('O2', 'an order of Pesa\'s that does not have the witness in its past still counts', [why(O3, w), fb.door('speaks_for', O3, w.blocks) === mama.id], [[], true]);
  check('O2', 'the earlier order still counts', why(O1, w), []);
}
{
  const { w, mama, other, hosti, order, witness } = world();
  const Wa = witness(other, 'STOP');
  const Wb = witness(hosti, 'stop please');
  const O = order('O', { after: [Wa.hash, Wb.hash] });
  check('O2', 'a witness by another host, or one saying "stop please", ends nothing', [why(O, w), fb.door('speaks_for', O, w.blocks) === mama.id], [[], true]);
}
{
  // where the grant states a handle, the witness must state the same
  const { w, mama, hosti, order, witness } = world({ handle: 'pesa-7' });
  const Wx = witness(hosti, 'STOP', 'pesa-8');
  const Ox = order('Ox', { after: [Wx.hash] });
  check('O2', 'the grant states handle pesa-7: a witness with handle pesa-8 ends nothing', why(Ox, w), []);
  const Wy = witness(hosti, 'STOP', 'pesa-7');
  const Oy = order('Oy', { after: [Wy.hash] });
  check('O2', 'one with its own handle ends it', why(Oy, w), ['not_live']);
}
{
  // the shape: both keys asked for; witness an id (grammar); said text; anything else shape
  const w = new World(), mama = P(w, 'mama'), pesa = P(w, 'pesa'), hosti = P(w, 'hosti');
  const mk = e => mama.make('grant', { kind: 'tool', scope: { types: ['promise'], ends_on: e } }, { to: pesa.id });
  check('O2', 'ends_on shapes: no said, said not text, an extra key, witness not an id: shape, shape, shape, grammar', [mk({ witness: hosti.id }), mk({ witness: hosti.id, said: 5 }), mk({ witness: hosti.id, said: 'STOP', x: 1 }), mk({ witness: 'hosti', said: 'STOP' })].map(g => readCodes(g, w)), [['shape'], ['shape'], ['shape'], ['grammar']]);
  // not compared by narrower_than: a child grant under a parent that names none may name its own ending term
  const parent = T(grant(mama, pesa, { types: ['promise'] }, {}, { depth: 1 }), 'PARENT');
  const child = pesa.make('grant', { kind: 'tool', scope: { types: ['promise'], ends_on: { witness: hosti.id, said: 'STOP' } } }, { to: mama.id, parent: parent.hash });
  check('O2', 'a child grant may state ends_on where its parent states none: not wider', readCodes(child, w).includes('wider_than_parent'), false);
}
done();
