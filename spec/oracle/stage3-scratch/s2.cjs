const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts } = require('./h.cjs');
const answer = (s, t, what = 'accepted') => s.write('observe', { status: what, kind: what }, { answers: t.hash });
// ---- S3b: a draw is waiting until it stands: inside her order it still needs a word that names it
{
  const S = 'S3b inside her order', w = new World(), harry = P(w, 'harry'), maria = P(w, 'maria'), K = kindOf(harry, 'flour');
  const sack = T(instance(harry, K, { pack: A('1', 'kg') }), 'sack');
  const o1 = offer(harry, harry, maria, sack, { quantity: A('0.6', 'kg'), price: A('1', 'GBP') });
  const a1 = accepts(maria, o1);
  const t1 = T(give(harry, sack, maria, A('0.6', 'kg'), { for: o1.hash, after: a1.hash }), 'to Maria 0.6');
  Q(S, 'her yes is in its past, nothing names the draw yet', ownS(w, sack));
  harry.write('observe', { kind: 'note' }, { for: t1.hash });
  Q(S, 'Harry names it in a later block of his own: it stands, and lands on the yes in its past', ownS(w, sack));
}
// ---- S6: three owners' flour in one silo
{
  const S = 'S6 silo', w = new World(), mill = P(w, 'mill'), harry = P(w, 'harry'), sam = P(w, 'sam'), maria = P(w, 'maria'), amara = P(w, 'amara'), K = kindOf(mill, 'flour');
  const fl = { harry: instance(harry, K, { pack: A('300', 'kg') }), sam: instance(sam, K, { pack: A('500', 'kg') }), maria: instance(maria, K, { pack: A('200', 'kg') }) };
  const who = { harry, sam, maria }, mk = [];
  for (const n of ['harry', 'sam', 'maria']) {
    const G = who[n].write('grant', { kind: 'toll', scope: { types: ['transform'] } }, { to: mill.id, what: fl[n].hash });
    mk.push(mill.write('transform', { name: 'into the silo', inputs: [{ from: fl[n].hash, amount: fl[n].state.pack }] }, { derives_from: [fl[n].hash], under: G.hash }));
  }
  const silo = T(mill.write('thing', { name: 'silo', pack: A('1000', 'kg') }, { of: K.hash, derives_from: mk.map(m => m.hash) }), 'silo');
  Q(S, 'the silo before any of them answers: no owner on the record', ownS(w, silo));
  const accs = { harry: answer(harry, silo), sam: answer(sam, silo), maria: answer(maria, silo) };
  Q(S, 'each answers accepted: Harry 300, Maria 200, Sam 500', ownS(w, silo));
  const mkSam = T(sam.write('transform', { name: 'flour', inputs: [{ from: silo.hash, amount: A('100', 'kg') }] }, { derives_from: [silo.hash] }), 'Sam draws 100');
  const tH = T(give(harry, silo, amara, A('300', 'kg')), 'Harry sells 300'); accept(amara, tH);
  const tH2 = T(give(harry, silo, amara, A('1', 'kg')), 'Harry 1 more'); 
  const mkMill = T(mill.write('transform', { name: 'for itself' }, { derives_from: [silo.hash] }), 'mill draws it');
  Q(S, 'Sam draws 100 (takes); Harry sells 300 (takes); 1 kg more (past); the mill (not_owner)', ownS(w, silo));
  // 790
  const w2 = new World(), m2 = P(w2, 'mill'), h2 = P(w2, 'harry'), s2 = P(w2, 'sam'), mr2 = P(w2, 'maria'), K2 = kindOf(m2, 'flour');
  const f2 = { harry: instance(h2, K2, { pack: A('300', 'kg') }), sam: instance(s2, K2, { pack: A('500', 'kg') }), maria: instance(mr2, K2, { pack: A('200', 'kg') }) };
  const mk2 = [];
  for (const [n, o] of [['harry', h2], ['sam', s2], ['maria', mr2]]) { const G = o.write('grant', { kind: 'toll', scope: { types: ['transform'] } }, { to: m2.id, what: f2[n].hash }); mk2.push(m2.write('transform', { name: 'into the silo', inputs: [{ from: f2[n].hash, amount: f2[n].state.pack }] }, { derives_from: [f2[n].hash], under: G.hash })); }
  const silo2 = m2.write('thing', { name: 'silo', pack: A('790', 'kg') }, { of: K2.hash, derives_from: mk2.map(m => m.hash) });
  answer(h2, silo2); answer(s2, silo2); answer(mr2, silo2);
  Q(S, 'the mill writes 790: owners named with no amount', ownS(w2, silo2));
  const ama = P(w2, 'amara'); const tt = T(give(h2, silo2, ama, A('10', 'kg')), 'an amount of an unsaid silo'); accept(ama, tt);
  Q(S, 'and a draw of an amount on it', ownS(w2, silo2));
}
// ---- S7: a carcass cut into parts
{
  const S = 'S7 carcass', w = new World(), leila = P(w, 'leila'), sam = P(w, 'sam'), amara = P(w, 'amara'), K = kindOf(leila, 'steer');
  const steer = T(instance(leila, K, {}), 'steer');
  const G = leila.write('grant', { kind: 'toll', scope: { types: ['transform'] } }, { to: sam.id, what: steer.hash });
  const cut = T(sam.write('transform', { name: 'cut' }, { derives_from: [steer.hash], under: G.hash }), 'cut');
  const parts = {};
  for (const [n, kg] of [['sideA', '140'], ['sideB', '140'], ['offal', '20'], ['hide', '10']]) parts[n] = sam.write('thing', { name: n, pack: A(kg, 'kg') }, { of: K.hash, derives_from: [cut.hash] });
  Q(S, 'the steer: cut under her grant', ownS(w, steer));
  Q(S, 'side A before she accepts: no owner', ownS(w, parts.sideA));
  for (const n of Object.keys(parts)) answer(leila, parts[n]);
  Q(S, 'side A after: Leila 140', ownS(w, parts.sideA));
  const t = T(give(leila, parts.sideA, amara, A('40', 'kg')), 'sells 40 kg'); accept(amara, t);
  Q(S, 'she sells 40 kg of side A to Amara: Amara 40, Leila 100', ownS(w, parts.sideA));
  // no grant
  const w2 = new World(), l2 = P(w2, 'leila'), s2 = P(w2, 'sam'), K2 = kindOf(l2, 'steer'), st2 = instance(l2, K2, {});
  const cut2 = s2.write('transform', { name: 'cut' }, { derives_from: [st2.hash] });
  const sideC = s2.write('thing', { name: 'sideC', pack: A('120', 'kg') }, { of: K2.hash, derives_from: [cut2.hash] });
  Q(S, 'no grant: the steer stays whole and Leila\'s', ownS(w2, st2));
  Q(S, 'no grant: his side C has no owner', ownS(w2, sideC));
}
// ---- S9: a stranger names Harry's sack in refs.of
{
  const S = 'S9 stranger of', w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila'), amara = P(w, 'amara'), K = kindOf(harry, 'flour');
  const sack = T(instance(harry, K, { pack: A('1', 'kg') }), 'sack');
  const lt = leila.write('thing', { name: 'a sack of Harry\'s' }, { of: sack.hash });
  Q(S, 'Harry\'s sack: owner Harry (an instance by its own block)', ownS(w, sack));
  Q(S, 'Leila\'s thing: owner Leila', ownS(w, lt));
  const t = T(give(harry, sack, amara, null), 'sells the sack'); accept(amara, t);
  Q(S, 'he sells the sack to Amara: Amara', ownS(w, sack));
}
// ---- S10: the millstone
{
  const S = 'S10 millstone', w = new World(), harry = P(w, 'harry'), maria = P(w, 'maria'), sam = P(w, 'sam'), K = kindOf(harry, 'stone');
  const stone = T(instance(harry, K, {}), 'stone');
  const t1 = T(give(harry, stone, maria, null), 'to Maria');
  const t2 = T(give(harry, stone, sam, null), 'to Sam');
  Q(S, 'to a silent Maria, then to Sam: Sam past from the first minute', ownS(w, stone));
  const y = answer(maria, t1);
  harry.write('observe', { kind: 'note' }, { for: t1.hash });
  Q(S, 'Maria\'s yes: lands, Maria', ownS(w, stone));
  // harry ends it
  const w2 = new World(), h = P(w2, 'harry'), m = P(w2, 'maria'), s = P(w2, 'sam'), K2 = kindOf(h, 'stone'), st = T(instance(h, K2, {}), 'stone');
  const u1 = T(give(h, st, m, null), 'to Maria');
  const stop = T(h.write('transfer', { status: 'stopped', stop: 'before' }, { updates: u1.hash }), 'Harry ends it');
  const seeM = T(m.write('observe', { kind: 'note' }, { for: stop.hash }), 'Maria sees the end');
  const u2 = T(give(h, st, s, null, { after: seeM.hash }), 'to Sam (her block in its past)');
  accept(s, u2);
  Q(S, 'ended before her yes, her next block sees it, then to Sam with her block in its past: takes', ownS(w2, st));
  const w3 = new World(), h3 = P(w3, 'harry'), m3 = P(w3, 'maria'), s3 = P(w3, 'sam'), K3 = kindOf(h3, 'stone'), st3 = T(instance(h3, K3, {}), 'stone');
  const v1 = T(give(h3, st3, m3, null), 'to Maria');
  const stop3 = T(h3.write('transfer', { status: 'stopped', stop: 'before' }, { updates: v1.hash }), 'Harry ends it');
  const seeM3 = T(m3.write('observe', { kind: 'note' }, { for: stop3.hash }), 'Maria sees the end');
  const v2 = T(give(h3, st3, s3, null), 'to Sam (before she saw it)');
  Q(S, 'the same, but Sam\'s draw does not have her block in its past: waiting on the end, never past', ownS(w3, st3));
}
