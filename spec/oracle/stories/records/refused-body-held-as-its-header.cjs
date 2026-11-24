const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, drawsOf, codes, sha } = L;
// A refused body is held as its header.
{
  const w = new World(), harry = P(w, 'harry'), sam = P(w, 'sam'), amara = P(w, 'amara');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('1', 'sack') }), 'L7');
  const dS = deal(harry, L7, sam, A('1', 'sack')), dA = deal(harry, L7, amara, A('1', 'sack'));
  const base = harry.head, seq0 = harry.seq;
  const h2 = T(sell(harry, L7, sam, dS, A('1', 'sack'), { at: '2026-11-12T10:00:00.0000001Z' }), 'H2'); harry.head = base; harry.seq = seq0;
  const h2b = T(sell(harry, L7, amara, dA, A('1', 'sack')), "H2'");
  check('refused body held as its header', 'H2 is valid and not read (time)', [codes(fb.door('valid', h2, w.blocks)), codes(fb.door('read', h2, w.blocks))], [[], ['time']]);
  const ch = fb.door('check_chain', w.blocks.filter(b => b.refs.author === harry.id && b.hash !== harry.id && b.refs.prev !== undefined && !b.state.audience === undefined), harry.id);
  const mine = w.blocks.filter(b => b.refs.author === harry.id && b.hash !== harry.id);
  const ch2 = fb.door('check_chain', mine, harry.id);
  check('refused body held as its header', 'chain(Harry): equivocations [[H2, H2\']]', ch2.equivocations.map(p => p.map(tg).sort()).sort(), [['H2', "H2'"]]);
  check('refused body held as its header', 'ownership(L7): not shown, lacks [H2]; never the other twin\'s receiver', ownersOf(own(w, L7)), { not_shown: true, lacks: ['H2'] });
}
// state.rule_set on every block, read by every reader. Sam S0; S1 a sale of crate C1 to Ben, state.rule_set a hash no reader runs.
{
  const w = new World(), sam = P(w, 'sam'), ben = P(w, 'ben');
  const K = kindOf(sam, 'crate'), C1 = T(instance(sam, K, { pack: A('1', 'crate') }), 'C1'), other = T(instance(sam, K, { pack: A('1', 'crate') }), 'C2');
  const dB = deal(sam, C1, ben, A('1', 'crate'));
  const s1 = T(sell(sam, C1, ben, dB, A('1', 'crate'), {}, { rule_set: sha('a rule set') }), 'S1');
  check('rule_set on every block', 'read(S1): unknown_rules (not undeclared_field)', codes(fb.door('read', s1, w.blocks)), ['unknown_rules']);
  check('rule_set on every block', 'ownership(C1): not shown, lacks [S1]', ownersOf(own(w, C1)), { not_shown: true, lacks: ['S1'] });
  check('rule_set on every block', 'ownership(C2): Sam\'s other things unchanged', ownersOf(own(w, other)), { owners: [['sam', '1']] });
  // a rule_set on an open type too
  const open = sam.make('observe', { kind: 'note', rule_set: sha('x') });
  check('rule_set on every block', 'rule_set on an open-type block (observe): unknown_rules', codes(fb.door('read', open, w.blocks)), ['unknown_rules']);
}
done();
