// Section 7, the bench and judges.
// R-J1 Bench Ade then Leila, `wait` 7 days, `grounds.clocks` the market office O. (1) Sam disputes Amara's accept; O receipts it 1 Nov. (2) O's cutoff 8 Nov, no word of Ade. (3) Leila `defeats` the delivery. Expect `accepted`. (4) Ade confirms in June. Expect nothing changes.
// R-J2 (1) Sam sells Amara a sack on credit, £60; Amara accepts; Sam delivers; Amara accepts. (2) Sam hands his place to Leila for £55; Leila accepts. (3) Sam and Amara name Zed. (4) Zed `defeats` Amara's accept. Expect Zed not on the bench; stage `done`; £60 to come to Leila.
// World B: Leila also answers Zed `accepted`. Expect stage `accepted`.
// R-J3 Who says a thing happened never rules. (kept from 1.8 P15) A signer a condition names in `by` who `defeats` a block of the deal: only her own reading; the stage does not change.
// R-J5 (1) Maria M1 claims Ned sprayed her carrot bed. (2) A thief with her phone key (reach P1D, clock Wanjiru) hands M1 to Pia. Expect the hand-over waiting `on: reach`; Maria's card ends the phone inside the day: it counts for nothing.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, day, yes, mkKey } = L;
const benchWorld = (o = {}) => {
  const w = new World(), sam = P(w, 'sam'), amara = P(w, 'amara'), ade = P(w, 'ade'), leila = P(w, 'leila'), office = P(w, 'office');
  const clocks = { names: [office.id], needed: 1 };
  const sch = sam.write('thing', { kind: 'schema', target: 'promise', grounds: { event: 'a sale', confirms: ['observe'], confirmers: [ade.id, leila.id], needed: 1, wait: 'P7D', ...(o.noClock ? {} : { clocks }) } });
  const K = kindOf(sam, 'flour'), F = T(instance(sam, K, { pack: A('10', 'kg') }), 'F');
  const s1 = T(sam.write('promise', { terms: { quantity: A('10', 'kg'), price: GBP(60) } }, { from: sam.id, to: amara.id, what: F.hash, schema: sch.hash }), 'S1');
  const a1 = T(yes(amara, s1), 'A1');
  const d = T(sam.write('transfer', { amount: A('10', 'kg') }, { what: F.hash, to_owner: amara.id, for: s1.hash }), 'D');
  const a3 = T(amara.write('transfer', { status: 'accepted' }, { answers: d.hash, for: s1.hash }), 'A3');
  return { w, sam, amara, ade, leila, office, s1, a1, d, a3, F };
};
{
  const X = benchWorld();
  const { w, sam, office, ade, leila, s1, d, a3 } = X;
  check('R-J1', 'before any dispute: underway (the delivery came and was accepted; the price is not paid)', stage(w, s1).stage, 'underway');
  const disp = T(sam.write('observe', { kind: 'dispute' }, { defeats: a3.hash }), 'DISPUTE');
  const r = T(office.write('observe', { kind: 'receipt' }, { derives_from: [disp.hash] }), 'O-receipt');
  // Leila's word before the wait has run: not her turn
  const early = leila.write('observe', { kind: 'ruling' }, { defeats: d.hash });
  check('R-J1', '(3) before the cutoff Leila has no turn: her defeat counts for nothing', stage(w, s1).stage, 'underway');
  const cut = office.write('observe', { kind: 'cutoff', when: 'P7D' }, { subject: disp.hash, derives_from: [r.hash] });
  const lw = leila.write('observe', { kind: 'ruling' }, { defeats: d.hash, after: [cut.hash] });
  check('R-J1', '(3) after the office\'s cutoff with no word of Ade, Leila\'s defeat of the delivery counts: accepted', stage(w, s1).stage, 'accepted');
  ade.write('observe', { kind: 'ruling' }, { confirms: d.hash });
  check('R-J1', '(4) Ade confirms in June: Leila\'s word had not seen it: nothing changes', stage(w, s1).stage, 'accepted');
}
{
  // no clock named and no receipt: Ade's silence holds; Leila never gets a turn
  const X = benchWorld({ noClock: true });
  const { w, sam, leila, s1, d, a3 } = X;
  sam.write('observe', { kind: 'dispute' }, { defeats: a3.hash });
  leila.write('observe', { kind: 'ruling' }, { defeats: d.hash });
  check('R-J1', 'with no clock and no receipt of Ade\'s, Leila has no turn: underway', stage(w, s1).stage, 'underway');
}
function j2(leilaAnswers) {
  const w = new World(), sam = P(w, 'sam'), amara = P(w, 'amara'), leila = P(w, 'leila'), zed = P(w, 'zed');
  const K = kindOf(sam, 'sack'), F = T(instance(sam, K, { pack: A('1', 'sack') }), 'F');
  const s1 = T(sam.write('promise', { terms: { quantity: A('1', 'sack'), price: GBP(60) } }, { from: sam.id, to: amara.id, what: F.hash }), 'S1');
  const ay = yes(amara, s1);
  const d = sam.write('transfer', { amount: A('1', 'sack') }, { what: F.hash, to_owner: amara.id, for: s1.hash });
  const a3 = T(amara.write('transfer', { status: 'accepted' }, { answers: d.hash, for: s1.hash }), 'A3');
  const before = stage(w, s1).stage;
  const h = T(sam.write('transfer', { amount: GBP(60) }, { what: s1.hash, to_owner: leila.id, after: ay.hash }), 'H');
  leila.write('transfer', { status: 'accepted' }, { answers: h.hash });
  const ref = T(sam.write('grant', { kind: 'referee', scope: { types: ['observe'] } }, { to: zed.id, subject: s1.hash }), 'REF');
  amara.write('grant', { status: 'accepted' }, { answers: ref.hash });
  if (leilaAnswers) leila.write('grant', { status: 'accepted' }, { answers: ref.hash });
  zed.write('observe', { kind: 'ruling' }, { defeats: a3.hash });
  return { w, s1, before, st: stage(w, s1) };
}
{
  const A_ = j2(false);
  check('R-J2', 'Zed not on the bench (Leila holds what Sam has to come and never answered): the stage is as before the ruling', [A_.st.stage === A_.before, A_.st.bench], [true, 'none']);
  const B_ = j2(true);
  check('R-J2', 'World B: Leila also answers Zed accepted: the stage falls to accepted', [B_.st.stage, B_.st.bench.names.length], ['accepted', 1]);
}
{
  const X = benchWorld();
  const { w, sam, s1, d, a3, amara } = X;
  const g = P(w, 'grader');
  g.write('observe', { kind: 'ruling' }, { defeats: d.hash });
  check('R-J3', 'a stranger who is no name on the bench changes nothing', stage(w, s1).stage, 'underway');
}
{
  const w = new World(), maria = P(w, 'maria'), pia = P(w, 'pia'), ned = P(w, 'ned'), wan = P(w, 'wanjiru');
  const phoneK = mkKey('maria-phone');
  const K1 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: phoneK.pub, wait: 'PT0S', reach: 'P1D' }], clocks: { names: [wan.id], needed: 1 } }, { subject: maria.id, updates: maria.id });
  const phone = maria.asKey(phoneK, K1.hash);
  const bed = kindOf(maria, 'carrot bed'), B = instance(maria, bed, {});
  const m1 = T(maria.write('observe', { kind: 'invasion' }, { subject: B.hash, to: ned.id, derives_from: [B.hash] }), 'M1');
  const ho = T(phone.write('transfer', {}, { what: m1.hash, to_owner: pia.id }), 'HO');
  const st = fb.door('stands', ho, w.blocks);
  check('R-J5', '(2) the hand-over of the claim waits on reach', [st.stands, st.waiting.map(x => x.on)], [false, ['reach']]);
  const end = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }] }, { subject: maria.id, updates: K1.hash });
  const r = wan.write('observe', { kind: 'receipt' }, { derives_from: [end.hash, ho.hash] });
  wan.write('observe', { kind: 'receipt' }, { derives_from: [ho.hash] });
  const st2 = fb.door('stands', ho, w.blocks);
  check('R-J5', 'Maria\'s card ends the phone inside the day: the hand-over counts for nothing', [st2.stands, st2.waiting.map(x => x.on)], [false, []]);
}
done();
