const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, drawsOf, codes, mkKey } = L;
const accept = (s, t) => s.write('transfer', { status: 'accepted' }, { answers: t.hash });
// One start. World: Maria's list [card (hash), phone P, tablet T], P marked receives: true; Sam gives Maria 10 sacks G; P accepts; T accepts, neither in the other's past;
// P sells 2 of G to Amara; T sells 2 of G to Ben. Expect Amara 2 (landed); Ben's draw not_on_chain; Maria 8 on P's line.
function world(mark) {
  const w = new World(), maria = P(w, 'maria'), sam = P(w, 'sam'), amara = P(w, 'amara'), ben = P(w, 'ben');
  const card = mkKey('maria-card'), phoneK = mkKey('maria-phone'), tabK = mkKey('maria-tablet');
  const voices = [{ key_hash: fb.door('key_hash', card.pub) }, { key: phoneK.pub, wait: 'PT0S', ...(mark === 'phone' ? { receives: true } : {}) }, { key: tabK.pub, wait: 'PT0S' }];
  const kg = maria.write('grant', { kind: 'key', voices }, { subject: maria.id, updates: maria.id });
  return { w, maria, sam, amara, ben, card, phoneK, tabK, kg };
}
{
  const { w, maria, sam, amara, ben, phoneK, tabK, kg } = world('phone');
  // the genesis key is her card in the list (by its hash): the phone and tablet are keys under the list; each confirms the list so it stands
  const c = maria.write('observe', { kind: 'confirm' }, { confirms: kg.hash });
  const K = kindOf(sam, 'sack'), G = T(instance(sam, K, { pack: A('10', 'sack') }), 'G');
  const give = sam.write('transfer', { amount: A('10', 'sack') }, { what: G.hash, to_owner: maria.id });
  const phone = maria.asKey(phoneK, kg.hash), tablet = maria.asKey(tabK, kg.hash);
  const base = c.hash;
  const aP = phone.write('transfer', { status: 'accepted' }, { answers: give.hash, after: [c.hash] });
  const aT = tablet.write('transfer', { status: 'accepted' }, { answers: give.hash, after: [c.hash] });
  const dA = deal(phone, G, amara, A('2', 'sack')), dB = deal(tablet, G, ben, A('2', 'sack'));
  const sA = T(sell(phone, G, amara, dA, A('2', 'sack')), 'P-sale'), sB = T(sell(tablet, G, ben, dB, A('2', 'sack')), 'T-sale');
  const r = own(w, G);
  check('one start', 'A: voice list read: P marks receives', fb.door('identity_state', maria.id, w.blocks).voices.map(v => !!v.receives), [false, true, false]);
  check('one start', 'A: P\'s sale to Amara', drawsOf(r).filter(x => x[0] === 'P-sale').map(x => x.slice(1)), [[true, null, 'landed']]);
  check('one start', 'A: T\'s sale to Ben is not_on_chain', drawsOf(r).filter(x => x[0] === 'T-sale').map(x => x.slice(1)), [[false, 'not_on_chain', null]]);
  check('one start', 'A: owners: Amara 2, Maria 8', ownersOf(r), { owners: [['amara', '2'], ['maria', '8']] });
}
// World B (the default): Mama's list [card B (hash), card A, SIM], no voice marked: Sam's gift lands on card B's line; a draw on it by her SIM key is not_on_chain.
{
  const w = new World(), mama = P(w, 'mama'), sam = P(w, 'sam'), leila = P(w, 'leila');
  const cardB = mkKey('mama-card-b'), sim = mkKey('mama-sim');
  const kg = mama.write('grant', { kind: 'key', voices: [{ key: mama.key.pub }, { key: cardB.pub, wait: 'PT0S' }, { key: sim.pub, wait: 'PT0S' }] }, { subject: mama.id, updates: mama.id });
  const c = mama.write('observe', { kind: 'confirm' }, { confirms: kg.hash });
  const K = kindOf(sam, 'sack'), G = T(instance(sam, K, { pack: A('4', 'sack') }), 'G');
  const give = sam.write('transfer', { amount: A('4', 'sack') }, { what: G.hash, to_owner: mama.id });
  const first = mama.write('transfer', { status: 'accepted' }, { answers: give.hash }); // her first voice accepts: the line starts here
  const simS = mama.asKey(sim, kg.hash);
  simS.write('observe', { kind: 'note' }, { after: [c.hash, first.hash] });
  const dL = deal(simS, G, leila, A('1', 'sack'));
  const sl = T(sell(simS, G, leila, dL, A('1', 'sack')), 'SIM-sale');
  const r = own(w, G);
  check('one start', 'B: a draw on the amount by her SIM key is not_on_chain', drawsOf(r).filter(x => x[0] === 'SIM-sale').map(x => x.slice(1)), [[false, 'not_on_chain', null]]);
  check('one start', 'B: Mama holds all 4 on her first voice\'s line', ownersOf(r), { owners: [['mama', '4']] });
}
done();
