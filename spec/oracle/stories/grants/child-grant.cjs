// A child grant. A parent with limit £100 (the text's W says £210, but its numbers need £100) on N0, depth 1. I passes child C1 to helper P, refs.meter P's own key grant: wider_than_parent. An open child: shape.
// Children £60, £60, £40 on N0, then I's own £1: true, past, true, past.
const L = require('./lib.cjs'); const { fb, T, tg, check, done, baseWorld, whyOf, A, GBP, per, grant, wf, P: person, receipt, promise } = L;
const W = baseWorld({ limit: 100, state: { depth: 1 } }); const { w, amara, harry, ai, G, A1, n0, f0, clocks } = W;
const blockOf = b => ({ type: b.type, state: b.state, refs: b.refs });
const helper = person(w, 'helper');
const childScope = (lim, extra = {}) => ({ types: ['promise'], parties: [harry.id], on: [A1.hash], limit: GBP(lim), clocks, ...extra });
const mk = (lim, refs, o = {}) => ai.write('grant', { kind: 'tool', scope: childScope(lim), ...(o.state || {}) }, { parent: G.hash, ...refs }, { keep: true });
const wrong = mk(60, { to: helper.id, meter: helper.id }), open = mk(60, { meter: n0.id });
check('child grant', 'a child on the helper\'s own key grant as meter: refused', fb.door('read', wrong, w.blocks).map(x => x.code), ['wider_than_parent']);
check('child grant', 'an open child: refused', fb.door('read', open, w.blocks).map(x => x.code), ['shape']);
const kids = [60, 60, 40].map((v, i) => T(ai.write('grant', { kind: 'tool', scope: childScope(v) }, { parent: G.hash, to: helper.id, meter: n0.id }), 'C' + (i + 1)));
// N's totals: C2 goes past the limit and does not move the total, so C3's receipt states 100
const tot = [60, 120, 100, 101], amt = [60, 60, 40, 1];
const rc = (b, i) => T(receipt(n0, b, [{ of: G.hash, amount: GBP(amt[i]), total: GBP(tot[i]) }]), 'R' + (i + 1));
kids.forEach((k, i) => rc(k, i));
const o = W.offer(harry, 0.1, {}, 'own1'), own1 = W.accept(o, 1, 'own1-accept'); rc(own1, 3);
const m = fb.door('meter', G, w.blocks);
const onG = m.draws.filter(d => d.of === G.hash), rows = onG.map(d => [tg(d.block), d.takes]);
check('child grant', 'the three children and I\'s own £1 on the parent\'s meter', rows.sort((a, b) => (a[0] < b[0] ? -1 : 1)), [['C1', true], ['C2', false], ['C3', true], ['own1-accept', false]]);
check('child grant', 'the why of the two that do not fit', onG.filter(d => !d.takes).map(d => [tg(d.block), d.why]).sort(), [['C2', 'past'], ['own1-accept', 'past']]);
done();
