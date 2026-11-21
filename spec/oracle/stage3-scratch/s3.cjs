const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts, mkKey } = require('./h.cjs');
const answer = (s, t, what = 'accepted') => s.write('observe', { status: what, kind: what }, { answers: t.hash });
// a second key of hers: a key grant that stands (she signs it again), and the new key's first block sees that second signing (its after)
const twoKeys = (s, w, name) => {
  const k2 = mkKey(name), KG = s.write('grant', { kind: 'key', voices: [{ key: s.key.pub }, { key: k2.pub, wait: 'PT0S' }] }, { subject: s.id, updates: s.id });
  const c = s.write('observe', { kind: 'confirm' }, { confirms: KG.hash });
  const k = s.asKey(k2, KG.hash), write = k.write.bind(k); let first = true;
  k.write = (type, state, refs = {}, o = {}) => { if (first) { first = false; refs = { ...refs, after: [...(refs.after ? [].concat(refs.after) : []), c.hash] }; } return write(type, state, refs, o); };
  return k;
};
// ---- S11: a seller's second key line; a pair on one line
{
  const S = 'S11 second key', w = new World(), harry = P(w, 'harry'), maria = P(w, 'maria'), leila = P(w, 'leila'), sam = P(w, 'sam'), K = kindOf(harry, 'stone');
  const till = twoKeys(harry, w, 'harry-till');
  const stone = T(instance(harry, K, {}), 'stone');
  const t1 = T(give(harry, stone, maria, null), 'phone sells to Maria'); accept(maria, t1);
  const t2 = T(give(maria, stone, leila, null), 'Maria resells'); accept(leila, t2);
  const t3 = T(give(till, stone, sam, null), 'till sells to Sam'); accept(sam, t3);
  Q(S, 'the phone sold to Maria, she resold to Leila; later his till (which never saw it) signs the stone to Sam', ownS(w, stone));
  // had the phone passed the till a stated part first: a pack
  const w2 = new World(), h2 = P(w2, 'harry'), s2 = P(w2, 'sam'), K2 = kindOf(h2, 'trays'), till2 = twoKeys(h2, w2, 'harry-till');
  const trays = T(instance(h2, K2, { pack: A('20', 'tray') }), 'trays');
  // the phone passes ten trays to its own owner on the till's line: a draw to_owner Harry himself, which the till's accept lands
  const pass = T(give(h2, trays, h2, A('10', 'tray')), 'phone passes 10 trays to the till');
  const acc = T(till2.write('transfer', { status: 'accepted' }, { answers: pass.hash }), 'the till accepts');
  const sold = T(give(till2, trays, s2, A('10', 'tray')), 'till sells 10'); accept(s2, sold);
  const sold2 = T(give(till2, trays, s2, A('1', 'tray')), 'till sells an 11th');
  Q(S, 'the phone passes ten trays to the till (to_owner himself, the till accepts); the till sells 10, then an 11th', ownS(w2, trays));
  // a pair: the phone signs twice on one prev
  const w3 = new World(), h3 = P(w3, 'harry'), m3 = P(w3, 'maria'), s3 = P(w3, 'sam'), K3 = kindOf(h3, 'stone'), st3 = T(instance(h3, K3, {}), 'stone');
  const head = h3.head, seq = h3.seq;
  const a = T(give(h3, st3, m3, null), 'sale 1 to Maria');
  h3.head = head; h3.seq = seq;
  const b = T(give(h3, st3, s3, null, {}, { marks: [{ scheme: 'n', value: 'second' }] }), 'sale 2 to Sam, same prev');
  accept(m3, a); accept(s3, b);
  Q(S, 'the phone signs twice on one prev: a pair', ownS(w3, st3));
  const later = give(h3, st3, m3, null); T(later, 'a later draw of that key');
  Q(S, 'and a later draw of that key reads pair too', ownS(w3, st3));
  // one receiver declines: the other lands
  const w4 = new World(), h4 = P(w4, 'harry'), m4 = P(w4, 'maria'), s4 = P(w4, 'sam'), K4 = kindOf(h4, 'stone'), st4 = T(instance(h4, K4, {}), 'stone');
  const hd = h4.head, sq = h4.seq;
  const a4 = T(give(h4, st4, m4, null), 'sale 1 to Maria');
  h4.head = hd; h4.seq = sq;
  const b4 = T(give(h4, st4, s4, null, {}, { marks: [{ scheme: 'n', value: 'second' }] }), 'sale 2 to Sam, same prev');
  accept(s4, b4);
  const dec = T(answer(m4, a4, 'declined'), 'Maria declines'); 
  Q(S, 'one receiver (Maria) lets go: the other is read as a draw alone', ownS(w4, st4));
}
// ---- S22: two accepts of one draw by two keys apart (One start)
{
  const S = 'S22 two accepts', w = new World(), sam = P(w, 'sam'), maria = P(w, 'maria'), amara = P(w, 'amara'), leila = P(w, 'leila'), K = kindOf(sam, 'sack');
  const tablet = twoKeys(maria, w, 'maria-tablet'); const phone = maria;
  const sacks = T(instance(sam, K, { pack: A('10', 'sack') }), 'ten sacks');
  const draw = T(give(sam, sacks, maria, null), 'Sam signs ten sacks to Maria');
  const phoneHead = phone.head, phoneSeq = phone.seq;
  const accP = T(phone.write('transfer', { status: 'accepted' }, { answers: draw.hash }), 'phone accepts');
  const accT = T(tablet.write('transfer', { status: 'accepted' }, { answers: draw.hash }), 'tablet accepts');
  Q(S, 'a reader holding only the phone\'s accept reads it as the start', (() => { const ww = new World(); ww.blocks = w.blocks.filter(b => b.hash !== accT.hash); return ownS(ww, sacks); })());
  const bam = give(phone, sacks, amara, A('2', 'sack')); T(bam, 'phone sells 2'); accept(amara, bam);
  const bleila = give(tablet, sacks, leila, A('2', 'sack')); T(bleila, 'tablet sells 2'); accept(leila, bleila);
  Q(S, 'both held: Maria owns the ten (Sam\'s draw landed) on no line; both sales not_on_line, no pair', ownS(w, sacks));
  const both = T(phone.write('transfer', { status: 'accepted' }, { answers: draw.hash, after: [accP.hash, accT.hash] }), 'phone accepts again, after names both');
  const bam2 = give(phone, sacks, amara, A('2', 'sack'), {}, { marks: [{ scheme: 'n', value: 'again' }] }); T(bam2, 'phone sells 2 (from the one start)'); accept(amara, bam2);
  const bleila2 = give(tablet, sacks, leila, A('2', 'sack'), {}, { marks: [{ scheme: 'n', value: 'again' }] }); T(bleila2, 'tablet sells 2 later'); accept(leila, bleila2);
  Q(S, 'her phone signs accepted again, its after naming both: the one start; its next sale takes, the tablet\'s stays not_on_line', ownS(w, sacks));
  Q(S, 'fork pairs listed', J(fb.door('fork_pairs', w.blocks)));
}
