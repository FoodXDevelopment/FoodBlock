const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, deal, sell, day, mkKey } = L;
const stands = (w, b) => fb.door('stands', b, w.blocks);
const std = (w, b) => { const r = stands(w, b); return [r.stands, r.waiting.map(x => x.on)]; };
// 3d-3 A clock is a line; `keepers` becomes `clocks`. World: (1) Maria M0, list with clocks { names: [Wanjiru W0], needed: 1 }, a voice with reach P1D. (2) Maria's phone sells F to Sam (S9).
// (3) Wanjiru replaces her phone key by a key grant W5. (4) Wanjiru's new key receipts S9, then cuts off through S9 plus a day. Expect S9 stands.
{
  const w = new World(), maria = P(w, 'maria'), sam = P(w, 'sam'), wanjiru = P(w, 'wanjiru');
  const phoneK = mkKey('maria-phone'), wNew = mkKey('wanjiru-new');
  const K1 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: phoneK.pub, wait: 'PT0S', reach: 'P1D' }], clocks: { names: [wanjiru.id], needed: 1 } }, { subject: maria.id, updates: maria.id });
  const phone = maria.asKey(phoneK, K1.hash);
  const Kd = kindOf(maria, 'flour'), F = T(instance(phone, Kd, { pack: A('5', 'kg') }), 'F');
  const s9 = T(sell(phone, F, sam, null, A('5', 'kg')), 'S9'); // joined to no other person's block: lone
  check('3d-3', 'S9 waits on its reach: no clock has spoken yet', std(w, s9), [false, ['reach']]);
  const nk = mkKey('wanjiru-new');
  const w5 = wanjiru.write('grant', { kind: 'key', voices: [{ key: nk.pub }] }, { subject: wanjiru.id, updates: wanjiru.id });
  const wn = wanjiru.asKey(nk, w5.hash);
  const rc = wn.write('observe', { kind: 'receipt' }, { derives_from: [s9.hash] });
  wn.write('observe', { kind: 'cutoff', when: 'P1D' }, { subject: s9.hash, derives_from: [rc.hash] }, { at: day(30) });
  check('3d-3', 'her new key receipts S9 and cuts off a day on: S9 stands (the wait follows her list, not one fixed key)', std(w, s9), [true, []]);
  check('3d-3', 'identity_state names the field clocks', [Object.keys(fb.door('identity_state', maria.id, w.blocks)).includes('clocks'), Object.keys(fb.door('identity_state', maria.id, w.blocks)).includes('keepers')], [true, false]);
}
// 3d-4 A cutoff by its place. World A: (1) Joe J1 bond as 3c-6, clocks Wanjiru and Leila. (2) Wanjiru W3 cuts off "07:00 20 Nov", her receipt of Joe's arrival W4 after it on her line, dated 06:55.
// Expect on Wanjiru's line: Joe late. World B: on 1 October Wanjiru signs W3' "the time has come" for 07:00 20 November, `at` 1 October. Expect W3' closes nothing.
function bond(two, cutAt) {
  const w = new World(), joe = P(w, 'joe'), amara = P(w, 'amara'), wanjiru = P(w, 'wanjiru'), leila = P(w, 'leila');
  const K = kindOf(joe, 'box'), X = T(instance(joe, K, {}), 'X');
  const DL = '2026-11-20T07:00:00.000Z';
  const cond = { without: { signal: 'arrived', by: [joe.id], subject: X.hash }, deadline: DL, clocks: { names: [wanjiru.id, leila.id].sort(), needed: two ? 2 : 1 } };
  const j1 = T(joe.write('transfer', { condition: cond }, { what: X.hash, to_owner: amara.id }), 'J1');
  amara.write('transfer', { status: 'accepted' }, { answers: j1.hash });
  const arr = joe.write('observe', { kind: 'arrived' }, { subject: X.hash }, { at: '2026-11-20T06:55:00.000Z' });
  return { w, joe, amara, wanjiru, leila, X, j1, arr, DL, cond };
}
{
  const { w, wanjiru, X, j1, arr, DL } = bond(false);
  const cut = wanjiru.write('observe', { kind: 'cutoff', when: DL }, { subject: j1.hash }, { at: DL });
  wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [arr.hash] }, { at: '2026-11-20T06:55:00.000Z' }); // her receipt of the arrival is AFTER the cutoff on her line, whatever its date says
  const r = own(w, X);
  check('3d-4', 'A: on her line the receipt of the arrival comes after the cutoff: Joe is late, J1 lands (Amara owns X)', ownersOf(r), { owners: [['amara', null]] });
}
{
  const { w, wanjiru, X, j1, arr, DL } = bond(false);
  wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [arr.hash] }, { at: '2026-11-20T06:55:00.000Z' });
  wanjiru.write('observe', { kind: 'cutoff', when: DL }, { subject: j1.hash }, { at: DL });
  check('3d-4', 'A\': the receipt of the arrival before the cutoff: Joe on time, X stays Joe\'s', ownersOf(own(w, X)).owners.map(o => o[0]), []);
}
{
  const { w, wanjiru, X, j1, DL } = bond(false);
  wanjiru.write('observe', { kind: 'cutoff', when: DL }, { subject: j1.hash }, { at: '2026-10-01T00:00:00.000Z' });
  check('3d-4', 'B: a cutoff signed on 1 October for 20 November closes nothing: J1 still held', drawsOf(own(w, X)).filter(x => x[0] === 'J1').map(x => x.slice(1)), [[true, null, 'held']]);
}
done();
