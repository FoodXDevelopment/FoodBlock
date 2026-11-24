const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
const encKey = n => fb.door('keypair', n === 'a' ? 'aa'.repeat(32) : 'bb'.repeat(32), 'std');
// A key grant is a key grant; the mail key. World: (1) Leila L0, list [card, phone P (reach P1D)], clocks Wanjiru. (2) Card ends P. (3) A thief with P signs a mail key grant E1. Expect E1 does not stand.
// (4) Card adds new phone Q; Q signs mail key grant E2. Expect E2 waiting `on: reach` until Wanjiru's cutoff a day on; then stands.
{
  const w = new World(), leila = P(w, 'leila'), wanjiru = P(w, 'wanjiru');
  const pK = mkKey('leila-phone'), qK = mkKey('leila-q');
  const mail1 = fb.door('keypair', '01'.repeat(32), 'std'), mail2 = fb.door('keypair', '02'.repeat(32), 'std');
  const pub = kp => kp.public_key_encrypt || kp.encrypt_public || Object.values(kp).find(v => typeof v === 'string' && v.length > 60 && v !== kp.public_key_sign) ;
  const K1 = leila.write('grant', { kind: 'key', voices: [{ key: leila.key.pub }, { key: pK.pub, wait: 'PT0S', reach: 'P1D' }], clocks: { names: [wanjiru.id], needed: 1 } }, { subject: leila.id, updates: leila.id });
  const K2 = T(leila.write('grant', { kind: 'key', voices: [{ key: leila.key.pub }], clocks: { names: [wanjiru.id], needed: 1 } }, { subject: leila.id, updates: K1.hash }), 'ends P');
  const thief = leila.asKey(pK, K1.hash);
  const E1 = T(thief.write('grant', { kind: 'key', public_key_encrypt: fb.encPublicOf('01'.repeat(32), 'std') }, { subject: leila.id }), 'E1');
  check('mail key', 'E1 (a thief\'s mail key grant from the ended phone) waits on its reach: no clock has spoken', std(w, E1), [false, ['reach']]);
  const r1 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [K2.hash] });
  const r2 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [E1.hash] });
  wanjiru.write('observe', { kind: 'cutoff', when: 'P1D' }, { subject: E1.hash, derives_from: [r2.hash] }, { at: day(40) });
  check('mail key', 'Wanjiru held the end of P before E1: E1 does not stand, and never will', std(w, E1), [false, []]);
  // card adds a new phone Q
  const K3 = T(leila.write('grant', { kind: 'key', voices: [{ key: leila.key.pub }, { key: qK.pub, wait: 'PT0S', reach: 'P1D' }], clocks: { names: [wanjiru.id], needed: 1 } }, { subject: leila.id, updates: K2.hash }), 'adds Q');
  const q = leila.asKey(qK, K3.hash);
  const E2 = T(q.write('grant', { kind: 'key', public_key_encrypt: fb.encPublicOf('02'.repeat(32), 'std') }, { subject: leila.id }), 'E2');
  check('mail key', 'E2 (the new phone\'s mail key grant) waits on its reach, not on a second signing', std(w, E2), [false, ['reach']]);
  const r3 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [E2.hash] });
  wanjiru.write('observe', { kind: 'cutoff', when: 'P1D' }, { subject: E2.hash, derives_from: [r3.hash] }, { at: day(45) });
  check('mail key', 'after Wanjiru\'s cutoff a day on, E2 stands', std(w, E2), [true, []]);
  // two mail key grants of one voice, neither in the other's past: a pair, neither stands
  const E3 = q.write('grant', { kind: 'key', public_key_encrypt: fb.encPublicOf('03'.repeat(32), 'std') }, { subject: leila.id, prev: E2.hash });
  q.head = E2.hash; q.seq = E2.state.seq;
  const E4 = q.write('grant', { kind: 'key', public_key_encrypt: fb.encPublicOf('04'.repeat(32), 'std') }, { subject: leila.id });
  check('mail key', 'two mail key grants of one voice that do not see each other are a pair: neither stands', [std(w, E3)[0], std(w, E4)[0]], [false, false]);
}
done();
