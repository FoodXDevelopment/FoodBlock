'use strict';
// node stories.cjs  : prints each question asked of the oracle and its answer (ANSWERS.md records them with the sentence of the spec that gives each)
const { fb, World, mkKey, person, Signer, receipt, cutoff, day, stands, asked } = require('./lib.cjs');
const M = require('./maria.cjs');
const L = [];
const worlds = [];
const _W = World; 
const Q = (story, q, a) => { L.push(`${story} | ${q} => ${a}`); console.log(`${story} | ${q} => ${a}`); };
const state = (w, id) => fb.door('identity_state', id, w.blocks);
const sba = (w, b) => fb.door('signed_by_author', b, w.blocks);
const key = n => mkKey(n);
const confirm = M.confirm;
const idxOf = (w, b) => w.blocks.indexOf(b);

// ---------------------------------------------------------------- 0. a genesis is a list of one voice
{
  const w = new World(); const a = person(w, 'solo');
  const st = state(w, a.id);
  Q('0 genesis', 'voices', JSON.stringify(st.voices.map(v => Object.keys(v))));
  Q('0 genesis', 'keepers', JSON.stringify(st.keepers));
  const bad = person(w, 'solo-reach', { reach: 'P1D' });
  Q('0 genesis', 'valid: a genesis with reach and no keepers', JSON.stringify(fb.door('valid', w.blocks.find(b => b.hash === bad.id), []).map(r => r.code)));
  const first = { type: 'grant', state: { kind: 'key', at: day(0), audience: 'public', seq: 1, voices: [{ names: ['a'.repeat(64)], wait: 'P1D' }], keepers: { names: ['b'.repeat(64)] } }, refs: { author: a.id, prev: a.id, subject: a.id, updates: a.id } };
  Q('0 genesis', 'check: a list whose first voice is people (names)', JSON.stringify(fb.writeFindings({ type: first.type, state: first.state, refs: first.refs }).map(r => r.code)));
  const k2 = { ...first, state: { ...first.state, voices: [{ key: a.key.pub, reach: 'P1D' }], keepers: undefined } }; delete k2.state.keepers;
  Q('0 genesis', 'check: a list with a reach and no keepers', JSON.stringify(fb.writeFindings({ type: k2.type, state: k2.state, refs: k2.refs }).map(r => r.code)));
}

// ---------------------------------------------------------------- 1. a lost phone
{
  const s = M.setup(), { w } = s, S = '1 lost phone';
  Q(S, 'identity_state after the genesis key signs her list and signs it again: voices count / keepers', `${state(w, s.maria.id).voices.length} / ${JSON.stringify(!!state(w, s.maria.id).keepers)}`);
  Q(S, 'stands(K1) the phone\'s own list', asked(w, s.K1));
  const oldBefore = s.maria.write('thing', { name: 'before' }, {}, { at: day(5) });
  const newphone = key('maria-newphone');
  const K2 = s.mum.write('grant', { kind: 'key', voices: M.withPhone(s, newphone), keepers: s.keepers, counted_to: s.C1.hash }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(10), see: s.C1 });
  const B2 = confirm(s.brother, K2, [], day(10, 0, 5));
  Q(S, 'stands(K2) mum signed, brother confirmed, no keeper has spoken', asked(w, K2));
  const cl = M.closeWait(s, K2, 'P7D', 7);
  const early = s.maria.write('thing', { name: 'during the week' }, { after: [K2.hash] }, { at: day(12) });
  Q(S, 'signed_by_author: a phone block written in the week, K2 in its past but not standing', String(sba(w, early)));
  Q(S, 'stands(K2) two keepers have receipted and cut off through receipt + P7D, nobody has confirmed again', asked(w, K2));
  const M2 = confirm(s.mum, K2, [cl.c1, cl.c2], day(17, 5));
  Q(S, 'stands(K2) mum again only (needed 2)', asked(w, K2));
  const B3 = confirm(s.brother, K2, [cl.c1, cl.c2], day(17, 6));
  Q(S, 'stands(K2) mum and brother both again after the wait', asked(w, K2));
  const st = state(w, s.maria.id);
  Q(S, 'identity_state.voices[2].key is the new phone', String(st.voices[2].key === newphone.pub));
  Q(S, 'identity_state.keys', `${st.keys.length} key(s); old phone among them: ${st.keys.includes(s.maria.key.pub)}`);
  Q(S, 'signed_by_author: the old phone\'s block before the key grant', String(sba(w, oldBefore)));
  const oldAfter = s.maria.write('thing', { name: 'after' }, { after: [B3.hash, M2.hash] }, { at: day(20) });
  Q(S, 'signed_by_author: an old phone block that has K2 standing in its past', String(sba(w, oldAfter)));
  const np = s.maria.asKey(newphone, K2.hash);
  const nb0 = np.write('thing', { name: 'too early' }, {}, { at: day(10, 1) });
  const nb = np.write('thing', { name: 'new phone block' }, { after: [B3.hash, M2.hash] }, { at: day(20, 1) });
  Q(S, 'signed_by_author: a new phone block (refs.key K2) with K2 standing in its past', String(sba(w, nb)));
  Q(S, 'signed_by_author: the new key\'s block written before K2 stood (K2 not standing in its past)', String(sba(w, nb0)));
  Q(S, 'stands(oldBefore) a reading-free thing: nothing it waits for', asked(w, oldBefore));
}

// ---------------------------------------------------------------- 2. a stolen phone
{
  const S = '2 stolen phone';
  const s = M.setup(), { w } = s;
  const sam = person(w, 'sam');
  const oven = s.maria.write('thing', { name: 'oven' }, {}, { at: day(1) });
  const sale = s.maria.write('transfer', { at: day(3, 9) }, { what: oven.hash, to_owner: sam.id }, {});
  Q(S, 'stands(sale) the thief sells the oven at nine; the phone\'s voice states reach P1D; no keeper has spoken', asked(w, sale));
  const r1 = receipt(s.shop, sale, day(3, 9, 1)), r2 = receipt(s.host, sale, day(3, 9, 2));
  Q(S, 'stands(sale) both keepers hold a receipt, no cutoff yet', asked(w, sale));
  // control world below; here the relatives cut the phone at noon
  const newList = [s.voices[0], s.voices[1]];
  const K3 = s.mum.write('grant', { kind: 'key', voices: newList, keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(3, 12), see: s.C1 });
  const rK = receipt(s.shop, K3, day(3, 12, 1));
  const cShop = cutoff(s.shop, sale, day(4, 10), day(4, 10), [K3]);
  const cHost = cutoff(s.host, sale, day(4, 10, 1), day(4, 10, 1));
  Q(S, 'stands(sale) one keeper received the key grant that leaves the phone out before her cutoff; the other\'s cutoff closed', asked(w, sale));
  // the thief\'s own key grant adding his key (30 days): the relatives\' no is received first
  const thiefKey = key('thief-key');
  const Kt = s.maria.write('grant', { kind: 'key', voices: [...s.voices, { key: thiefKey.pub, wait: 'PT0S' }], keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(3, 9, 5) });
  Q(S, 'stands(thief\'s key grant adding his key) waits 30 days, not confirmed', asked(w, Kt));
}
{
  const S = '2b stolen phone, control';
  const s = M.setup(), { w } = s, sam = person(w, 'sam');
  const oven = s.maria.write('thing', { name: 'oven' }, {}, { at: day(1) });
  const sale = s.maria.write('transfer', { at: day(3, 9) }, { what: oven.hash, to_owner: sam.id }, {});
  const r1 = receipt(s.shop, sale, day(3, 9, 1)), r2 = receipt(s.host, sale, day(3, 9, 2));
  cutoff(s.shop, sale, day(4, 10), day(4, 10)); cutoff(s.host, sale, day(4, 10, 1), day(4, 10, 1));
  Q(S, 'stands(sale) two keepers cut off through receipt + P1D with nothing unnamed, no end', asked(w, sale));
}
{
  const S = '2c a voice above confirms a reach word';
  const s = M.setup(), { w } = s, sam = person(w, 'sam');
  const oven = s.maria.write('thing', { name: 'oven' }, {}, { at: day(1) });
  const sale = s.maria.write('transfer', { at: day(3, 9) }, { what: oven.hash, to_owner: sam.id }, {});
  Q(S, 'stands(sale) before anyone above has spoken', asked(w, sale));
  // the card shows itself and confirms the sale: a voice above names it in refs.confirms
  const cardK = key('maria-card');
  const showing = new Signer(w, s.maria.id, cardK, s.K1.hash, s.K1.hash);
  const show = showing.write('grant', { kind: 'key', shown_key: cardK.pub, voices: s.voices, keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(3, 10), see: s.C1 });
  showing.kg = show.hash; const cf = showing;
  // the shown key's later blocks name the key grant that showed it
  const confirmSale = cf.write('observe', { kind: 'confirm' }, { confirms: sale.hash }, { at: day(3, 10, 5) });
  Q(S, 'signed_by_author(card\'s showing block)', String(sba(w, show)));
  Q(S, 'signed_by_author(card\'s later block, refs.key the showing grant)', String(sba(w, confirmSale)));
  Q(S, 'stands(sale) the card (a voice above the phone) names it in refs.confirms', asked(w, sale));
}

// ---------------------------------------------------------------- 3. a thief with ten minutes
{
  const S = '3 ten minutes';
  const s = M.setup(), { w } = s, leila = person(w, 'leila');
  const lk = key('leila-key');
  const KA = s.maria.write('grant', { kind: 'key', voices: [s.voices[0], s.voices[1], { key: s.maria.key.pub, wait: 'PT0S', reach: 'PT0S' }, { key: lk.pub, wait: 'PT0S' }], keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(5, 9) });
  Q(S, '(1) a list putting her key in the phone\'s place with wait and reach zero: is it a key grant (stands)?', asked(w, KA));
  confirm(s.maria, KA, [], day(5, 9, 5));
  Q(S, '(1) the same, and the phone signs it again at once', asked(w, KA));
  const KB = s.maria.write('grant', { kind: 'key', voices: [...s.voices, { key: lk.pub, wait: 'PT0S' }], keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(5, 9, 6) });
  Q(S, '(1b) a list that keeps the phone\'s place as it was and adds her key below, never signed again by the phone', asked(w, KB));
  const G = s.maria.write('grant', { kind: 'agent', scope: { types: ['transfer'] } }, { to: leila.id }, { at: day(5, 9, 7) });
  Q(S, '(2) a grant to her own key, never signed again (the planted grant)', asked(w, G));
  const A = s.maria.write('observe', { kind: 'account', destination: 'leila-wallet' }, {}, { at: day(5, 9, 8) });
  Q(S, '(3) a new account word', asked(w, A));
  const sam = person(w, 'sam'), van = s.maria.write('thing', { name: 'van' }, {}, { at: day(1) });
  const V = s.maria.write('transfer', { at: day(5, 9, 9) }, { what: van.hash, to_owner: sam.id }, {});
  Q(S, '(4) the van sold, no keeper has received it', asked(w, V));
  receipt(s.shop, V, day(5, 9, 10)); receipt(s.host, V, day(5, 9, 11));
  cutoff(s.shop, V, day(6, 10), day(6, 10)); cutoff(s.host, V, day(6, 10, 1), day(6, 10, 1));
  Q(S, '(4) the van sold, a day passes, two cutoffs close the reach (Maria not told)', asked(w, V));
  const thiefPhone = state(w, s.maria.id);
  Q(S, 'identity_state.keys: Leila\'s key speaks?', String(thiefPhone.keys.includes(lk.pub)));
  Q(S, 'identity_state.waiting lists (blocks, on)', JSON.stringify(thiefPhone.waiting.map(x => ({ i: w.blocks.findIndex(b => b.hash === x.block), on: x.on })).sort((a, b) => a.i - b.i)));
}

// ---------------------------------------------------------------- 4. a malicious host
{
  const S = '4 malicious host';
  const s = M.setup(), { w } = s;
  const thiefKey = key('host-thief');
  const Kt = s.maria.write('grant', { kind: 'key', voices: [...s.voices.slice(0, 2), { key: thiefKey.pub, wait: 'P30D', reach: 'P1D' }], keepers: s.keepers, counted_to: s.C1.hash }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(5) });
  const r = receipt(s.host, Kt, day(5, 0, 1));
  const c = cutoff(s.host, Kt, day(36), day(5, 0, 2));  // backdated: signed now, claims 31 days
  confirm(s.maria, Kt, [c], day(5, 0, 3));
  Q(S, 'stands(a key grant putting the thief in) the host alone cuts off (two keepers needed of three)', asked(w, Kt));
  // she names the host her only keeper, in a world of her own
}
{
  const S = '4b host as the only keeper';
  const w = new World(); const maria = person(w, 'm2'), host = person(w, 'h2'), mum = person(w, 'mum2');
  const card = key('m2-card');
  const voices = [{ key_hash: fb.keyHash(card.pub) }, { names: [mum.id], wait: 'P7D' }, { key: maria.key.pub, wait: 'P30D', reach: 'P1D' }];
  const keepers = { names: [host.id] };
  const K1 = maria.write('grant', { kind: 'key', voices, keepers }, { subject: maria.id, updates: maria.id }, { at: day(0) });
  const C1 = confirm(maria, K1, [], day(0, 0, 1));
  const tk = key('m2-thief');
  const Kt = maria.write('grant', { kind: 'key', voices: [...voices.slice(0, 2), { key: tk.pub, wait: 'P30D', reach: 'P1D' }], keepers }, { subject: maria.id, updates: K1.hash }, { at: day(5) });
  receipt(host, Kt, day(5, 0, 1));
  const c = cutoff(host, Kt, day(36), day(5, 0, 2));
  const cf = confirm(maria, Kt, [c], day(5, 0, 3));
  Q(S, 'stands(thief\'s key grant) with the host her only keeper, backdating a cutoff through receipt + P30D', asked(w, Kt));
  // the card shows itself, puts a new phone key in place and names new keepers: first voice, wait zero
  const nk = key('m2-newphone'), other = person(w, 'other-keeper');
  const showing = new Signer(w, maria.id, card, K1.hash, K1.hash);
  const Ks = showing.write('grant', { kind: 'key', shown_key: card.pub, voices: [{ key_hash: fb.keyHash(card.pub) }, voices[1], { key: nk.pub, wait: 'P30D', reach: 'P1D' }], keepers: { names: [other.id] } }, { subject: maria.id, updates: K1.hash }, { at: day(6), see: C1 });
  Q(S, 'stands(card\'s key grant: new phone key, new keepers) not yet signed again', asked(w, Ks));
  showing.kg = Ks.hash;
  confirm(showing, Ks, [], day(6, 0, 1));
  Q(S, 'stands(card\'s key grant) the card signs it again (first voice: wait zero, no clock read)', asked(w, Ks));
  Q(S, 'identity_state.keepers is the new keepers', String(JSON.stringify(state(w, maria.id).keepers.names) === JSON.stringify([other.id])));
  Q(S, 'stands(thief\'s key grant) a list already replaced: is it a key grant', asked(w, Kt));
}

// ---------------------------------------------------------------- 5. quarrelling relatives; two key grants of one voice that do not see each other
{
  const S = '5 quarrelling relatives';
  const w = new World(); const maria = person(w, 'q-maria'), shop = person(w, 'q-shop'), host = person(w, 'q-host'), aunt = person(w, 'q-aunt');
  const mum = person(w, 'q-mum'), brother = person(w, 'q-brother'), sister = person(w, 'q-sister');
  const card = key('q-card');
  const keepers = { names: [shop.id, host.id, aunt.id].sort(), needed: 2 };
  const rel = { names: [mum.id, brother.id, sister.id].sort(), needed: 2, wait: 'P7D' };
  const voices = [{ key_hash: fb.keyHash(card.pub) }, rel, { key: maria.key.pub, wait: 'P30D', reach: 'P1D' }];
  const K1 = maria.write('grant', { kind: 'key', voices, keepers }, { subject: maria.id, updates: maria.id }, { at: day(0) });
  const C1 = confirm(maria, K1, [], day(0, 0, 1));
  const kA = key('q-keyA'), kB = key('q-keyB');
  const Ka = mum.write('grant', { kind: 'key', voices: [voices[0], rel, { key: kA.pub, wait: 'P30D', reach: 'P1D' }], keepers }, { subject: maria.id, updates: K1.hash }, { at: day(10), see: C1 });
  confirm(brother, Ka, [], day(10, 0, 1));
  const Kb = sister.write('grant', { kind: 'key', voices: [voices[0], rel, { key: kB.pub, wait: 'P30D', reach: 'P1D' }], keepers }, { subject: maria.id, updates: K1.hash }, { at: day(10, 0, 2), see: C1 });
  confirm(mum, Kb, [], day(10, 0, 3));
  const W = { shop, host, aunt }; const sw = { w, shop, host, aunt };
  const clA = M.closeWait(sw, Ka, 'P7D', 7), clB = M.closeWait(sw, Kb, 'P7D', 7, day(10, 2));
  [mum, brother].forEach((x, i) => confirm(x, Ka, [clA.c1, clA.c2], day(17, 5 + i)));
  [sister, mum].forEach((x, i) => confirm(x, Kb, [clB.c1, clB.c2], day(17, 8 + i)));
  Q(S, 'stands(Ka) mum+brother, a wait run, needed 2', asked(w, Ka));
  Q(S, 'stands(Kb) sister+mum, a wait run, needed 2 (neither sees the other)', asked(w, Kb));
  // a third that has both in its causal past, by any two
  const kC = key('q-keyC');
  const Kc = mum.write('grant', { kind: 'key', voices: [voices[0], rel, { key: kC.pub, wait: 'P30D', reach: 'P1D' }], keepers, }, { subject: maria.id, updates: K1.hash, after: [Ka.hash, Kb.hash].sort() }, { at: day(18) });
  confirm(brother, Kc, [], day(18, 0, 1));
  const clC = M.closeWait(sw, Kc, 'P7D', 7, day(18, 2));
  confirm(mum, Kc, [clC.c1, clC.c2], day(25, 5)); confirm(brother, Kc, [clC.c1, clC.c2], day(25, 6));
  Q(S, 'stands(Kc) a third by the same voice that has both in its causal past, after its wait', asked(w, Kc));
  Q(S, 'identity_state.voices[2].key is Kc\'s key', String(state(w, maria.id).voices[2].key === kC.pub));
}
{
  const S = '5b the card says no';
  const w = new World(); const maria = person(w, 'n-maria'), shop = person(w, 'n-shop'), host = person(w, 'n-host'), aunt = person(w, 'n-aunt'), mum = person(w, 'n-mum'), brother = person(w, 'n-brother');
  const card = key('n-card');
  const keepers = { names: [shop.id, host.id, aunt.id].sort(), needed: 2 };
  const rel = { names: [mum.id, brother.id].sort(), needed: 2, wait: 'P7D' };
  const voices = [{ key_hash: fb.keyHash(card.pub) }, rel, { key: maria.key.pub, wait: 'P30D', reach: 'P1D' }];
  const K1 = maria.write('grant', { kind: 'key', voices, keepers }, { subject: maria.id, updates: maria.id }, { at: day(0) });
  const C1 = confirm(maria, K1, [], day(0, 0, 1));
  const kA = key('n-keyA');
  const Ka = mum.write('grant', { kind: 'key', voices: [voices[0], rel, { key: kA.pub, wait: 'P30D', reach: 'P1D' }], keepers }, { subject: maria.id, updates: K1.hash }, { at: day(10), see: C1 });
  confirm(brother, Ka, [], day(10, 0, 1));
  // the card says no: a key grant of its own for the same list, restating it unchanged
  const showing = new Signer(w, maria.id, card, K1.hash, K1.hash);
  const No = showing.write('grant', { kind: 'key', shown_key: card.pub, voices, keepers }, { subject: maria.id, updates: K1.hash }, { at: day(12), see: C1 });
  const sw = { w, shop, host, aunt };
  const r1 = receipt(shop, Ka, day(10, 1)), r2 = receipt(host, Ka, day(10, 2));
  const rn = receipt(shop, No, day(12, 1));
  const c1 = cutoff(shop, Ka, day(17, 2), day(17, 2), [No]), c2 = cutoff(host, Ka, day(17, 3), day(17, 3));
  confirm(mum, Ka, [c1, c2], day(17, 5)); confirm(brother, Ka, [c1, c2], day(17, 6));
  Q(S, 'stands(Ka) one keeper\'s line holds the card\'s no before her cutoff that closes the wait', asked(w, Ka));
  const rn2 = receipt(host, No, day(12, 2));
  Q(S, 'signed_by_author(card\'s no)', String(sba(w, No)));
}
{
  const S = '5c a key grant naming a list already replaced; no keepers read';
  const w = new World(); const a = person(w, 'r-a');
  const k2 = key('r-k2'), k3 = key('r-k3');
  const K1 = a.write('grant', { kind: 'key', voices: [{ key: a.key.pub }, { key: k2.pub }] }, { subject: a.id, updates: a.id }, { at: day(0) });
  confirm(a, K1, [], day(0, 0, 1));
  const Kold = a.write('grant', { kind: 'key', voices: [{ key: a.key.pub }, { key: k3.pub }] }, { subject: a.id, updates: a.id }, { at: day(1) });
  Q(S, 'stands(K) a list that names the genesis (already replaced by K1 standing in its past)', asked(w, Kold));
}

// ---------------------------------------------------------------- 6. death
{
  const S = '6 death';
  const w = new World(); const harry = person(w, 'harry'), doctor = person(w, 'doctor'), sister = person(w, 'h-sister'), nephew = person(w, 'nephew'), succ = person(w, 'successor');
  const k1 = person(w, 'h-keeper1'), k2 = person(w, 'h-keeper2'), k3 = person(w, 'h-keeper3');
  const card = key('harry-card'), phone = harry.key;
  const keepers = { names: [k1.id, k2.id, k3.id].sort(), needed: 2 };
  const wit = { names: [doctor.id, sister.id].sort(), needed: 2, wait: 'P14D' };
  const voices = [{ key_hash: fb.keyHash(card.pub) }, wit, { key: phone.pub, wait: 'P30D', reach: 'P1D' }];
  // Harry's genesis key is the phone's... the genesis key is the first voice at first; he restates the list: card first, witnesses, then the phone below
  const K1 = harry.write('grant', { kind: 'key', voices, keepers }, { subject: harry.id, updates: harry.id }, { at: day(0) });
  const C1 = confirm(harry, K1, [], day(0, 0, 1));
  const heir = person(w, 'heir');
  const G = harry.write('grant', { kind: 'successor', keys: [], scope: { types: ['observe.close', 'transfer'], parties: [heir.id] } }, { to: succ.id }, { at: day(1) });
  // the grant, signed twice: the phone is below the witnesses; its wait is 30 days; the card (a voice above) signs it again instead
  const cardS = new Signer(w, harry.id, card, K1.hash, K1.hash);
  const show = cardS.write('grant', { kind: 'key', shown_key: card.pub, voices, keepers }, { subject: harry.id, updates: K1.hash }, { at: day(1, 1), see: C1 });
  cardS.kg = show.hash; const cs = cardS;
  const gc = confirm(cs, G, [], day(1, 2));
  Q(S, 'stands(successor grant) a voice above the phone (the card) signs it', asked(w, G));
  // the witnesses' key grant: leaves no voice at their place or below
  const Kw = doctor.write('grant', { kind: 'key', voices: [voices[0]], keepers }, { subject: harry.id, updates: K1.hash }, { at: day(30), see: C1 });
  confirm(sister, Kw, [], day(30, 0, 1));
  // the nephew holds the phone and says no: the phone is below them
  const no = harry.write('grant', { kind: 'key', voices, keepers }, { subject: harry.id, updates: K1.hash }, { at: day(31) });
  const sw = { w, shop: k1, host: k2, aunt: k3 };
  const cl = M.closeWait(sw, Kw, 'P14D', 14, day(30, 1));
  const d1 = confirm(doctor, Kw, [cl.c1, cl.c2], day(45, 5)), d2 = confirm(sister, Kw, [cl.c1, cl.c2], day(45, 6));
  Q(S, 'stands(Kw) fourteen days on, no "no" from a voice above (the phone is below them)', asked(w, Kw));
  // an heir's transfer under the successor grant: speaks for no one before a counted close; after it, for her
  const thing = harry.write('thing', { name: 'harry\'s boat' }, {}, { at: day(2) });
  const early = succ.write('transfer', { at: day(40) }, { what: thing.hash, to_owner: heir.id, under: G.hash }, {});
  Q(S, 'under_ok(heir transfer) before any close: speaks for no one', String(fb.door('under_ok', early, w.blocks)));
  const close = succ.write('observe', { kind: 'close' }, { subject: harry.id, under: G.hash, after: [d1.hash, d2.hash, gc.hash].sort() }, { at: day(46) });
  const heirT = succ.write('transfer', { at: day(47) }, { what: thing.hash, to_owner: heir.id, under: G.hash, after: [close.hash] }, {});
  Q(S, 'under_ok(heir transfer) with the successor\'s close (the grant stands, the witnesses\' key grant stands in its past) in its causal past', String(fb.door('under_ok', heirT, w.blocks)));
  const later = cs.write('grant', { kind: 'key', voices: [voices[0], wit, { key: phone.pub }], keepers }, { subject: harry.id, updates: Kw.hash, after: [close.hash] }, { at: day(50) });
  confirm(cs, later, [], day(50, 0, 1));
  Q(S, 'stands(a later key grant of Harry\'s, a counted close in its past)', asked(w, later));
  Q(S, 'identity_state.voices length (the witnesses\' grant stood: card only)', String(state(w, harry.id).voices.length));
}

// ---------------------------------------------------------------- 7. one basic phone and a card (Mama Achieng)
{
  const S = '7 Mama Achieng';
  const w = new World(); const mama = person(w, 'achieng-cardA'), soko = person(w, 'soko'), sim = person(w, 'sim-tool');
  const cardB = key('achieng-cardB'), cardA2 = key('achieng-cardA2');
  const A = mama.key;
  const vs = [{ key_hash: fb.keyHash(cardB.pub) }, { key: A.pub, wait: 'PT0S' }];
  const K1 = mama.write('grant', { kind: 'key', voices: vs }, { subject: mama.id, updates: mama.id }, { at: day(0) });
  Q(S, 'stands(list) card A restates the list, card B above it by hash, A below, no keepers: not yet signed again', asked(w, K1));
  const C1 = confirm(mama, K1, [], day(0, 0, 1));
  Q(S, 'stands(list) card A signs it again (zero wait, no keepers)', asked(w, K1));
  const Gs = mama.write('grant', { kind: 'agent', scope: { types: ['promise'] } }, { to: sim.id }, { at: day(1) });
  Q(S, 'stands(grant to the SIM tool) card A (place 1, wait PT0S) once', asked(w, Gs));
  confirm(mama, Gs, [], day(1, 0, 1));
  Q(S, 'stands(grant to the SIM tool) card A twice', asked(w, Gs));
  // card A stolen with its PIN: the thief signs as her at once, and twice
  const thiefSale = mama.write('promise', { what: 'maize' }, {}, { at: day(2) });
  Q(S, 'signed_by_author(the thief\'s block signed with card A)', String(sba(w, thiefSale)));
  // she shows card B once: a key grant putting a new card in A's place
  const showing = new Signer(w, mama.id, cardB, K1.hash, K1.hash);
  const show = showing.write('grant', { kind: 'key', shown_key: cardB.pub, voices: [{ key_hash: fb.keyHash(cardB.pub) }, { key: cardA2.pub, wait: 'PT0S' }] }, { subject: mama.id, updates: K1.hash }, { at: day(3), see: C1 });
  showing.kg = show.hash;
  const c2 = confirm(showing, show, [], day(3, 0, 1));
  Q(S, 'stands(card B\'s key grant) card B signs it twice', asked(w, show));
  const thiefAfter = mama.write('promise', { what: 'maize 2' }, { after: [c2.hash] }, { at: day(4) });
  Q(S, 'signed_by_author(the thief\'s block signed with card A that has the new list standing in its past)', String(sba(w, thiefAfter)));
  Q(S, 'signed_by_author(the thief\'s block signed before, never seeing it) still true', String(sba(w, thiefSale)));
  Q(S, 'identity_state.keys (B shown, A2)', String(state(w, mama.id).keys.length));
}

// ---------------------------------------------------------------- 8. one voice and no clock
{
  const S = '8 one voice, no clock';
  const w = new World(); const a = person(w, 'lone'), r = person(w, 'lone-rec');
  const g = a.write('grant', { kind: 'agent', scope: { types: ['transfer'] } }, { to: r.id }, { at: day(1) });
  Q(S, 'stands(grant) signed once', asked(w, g));
  confirm(a, g, [], day(1, 0, 1));
  Q(S, 'stands(grant) signed again by the same key (first voice, wait zero)', asked(w, g));
  const sale = a.write('promise', { what: 'x' }, {}, { at: day(2) });
  Q(S, 'stands(a promise) no reach stated, no relier yet', asked(w, sale));
  const taker = person(w, 'taker');
  const acc = taker.write('promise', { what: 'x', status: 'accepted' }, { answers: sale.hash, for: sale.hash }, { at: day(2, 1) });
  if (fb.door('valid', acc, w.blocks).length) console.log('INVALID accept', JSON.stringify(fb.door('valid', acc, w.blocks)));
  Q(S, 'stands(a promise) a relier\'s accept (not its signer) that has seen no end', asked(w, sale));
  Q(S, 'identity_state.waiting is empty', JSON.stringify(state(w, a.id).waiting.length));
}

// ---------------------------------------------------------------- 9. a broken suite (a suite move cuts by causal order alone)
{
  const S = '9 broken suite';
  const w = new World(); const harry = person(w, 'sm-harry');
  const sound = mkKey('sm-sound', 'p256'), cardHash = key('sm-card');
  const phone = harry.key;
  // list: a hash of a key in a sound suite first (never shown), then the std phone
  const soundHash = { key_hash: fb.keyHash(sound.pub, 'p256'), suite: 'p256' };
  const K1 = harry.write('grant', { kind: 'key', voices: [soundHash, { key: phone.pub, wait: 'PT0S' }] }, { subject: harry.id, updates: harry.id }, { at: day(0) });
  const C1 = confirm(harry, K1, [], day(0, 0, 1));
  // the forger signs as the phone; Harry shows the card's key (sound) once and puts sound keys in every place
  const forged = harry.write('promise', { what: 'cited by the move' }, {}, { at: day(2) });
  const showing = new Signer(w, harry.id, sound, K1.hash, K1.hash);
  const newList = [{ key: sound.pub, suite: 'p256' }, { key: mkKey('sm-sound2', 'p256').pub, suite: 'p256', wait: 'PT0S' }];
  const move = showing.write('grant', { kind: 'key', shown_key: sound.pub, voices: newList }, { subject: harry.id, updates: K1.hash }, { at: day(3), see: [C1, forged] });
  showing.kg = move.hash;
  const mc = confirm(showing, move, [], day(3, 0, 1));
  Q(S, 'stands(the key grant that puts sound-suite keys in every place)', asked(w, move));
  Q(S, 'signed_by_author(old phone block that the move has in its causal past)', String(sba(w, forged) ));
  const unseen = harry.write('promise', { what: 'forger, later, not cited by the move' }, {}, { at: day(2, 5) });
  Q(S, 'signed_by_author(old phone block written before the move, not in the move\'s causal past, cut by causal order alone)', String(sba(w, unseen)));
  const forged2 = harry.write('promise', { what: 'forger, twin', seq: unseen.state.seq }, { prev: unseen.refs.prev }, { at: day(2, 6) });
  Q(S, 'fork_pairs: two old-key blocks naming one prev, neither in the move\'s causal past (they count for nothing)', JSON.stringify(fb.door('fork_pairs', w.blocks).length));
  Q(S, 'fork_pairs: the same two blocks with no suite move held (control)', JSON.stringify(fb.door('fork_pairs', w.blocks.filter(b => b !== move && b !== mc)).length));
}

// ---------------------------------------------------------------- 10. a key under a voice, and a lower voice changing its own wait
{
  const S = '10 key under a voice';
  const s = M.setup(), { w } = s;
  const tablet = key('maria-tablet');
  const U = s.maria.write('grant', { kind: 'key', public_key_sign: tablet.pub }, { subject: s.maria.id }, { at: day(2) });
  const t = s.maria.asKey(tablet, U.hash);
  const t0 = t.write('thing', { name: 'tablet note' }, {}, { at: day(2, 1) });
  Q(S, 'signed_by_author(tablet block) the key grant adding it waits 30 days (phone), no confirmation yet', String(sba(w, t0)));
  Q(S, 'stands(U) added under the phone', asked(w, U));
  const cl = M.closeWait(s, U, 'P30D', 30, day(2, 2));
  const Cu = confirm(s.maria, U, [cl.c1, cl.c2], day(33));
  Q(S, 'stands(U) the phone signs it again after the 30 days closed on two keepers', asked(w, U));
  const t1 = t.write('thing', { name: 'tablet after' }, { after: [Cu.hash] }, { at: day(34) });
  Q(S, 'signed_by_author(tablet block that has U standing in its past)', String(sba(w, t1)));
  Q(S, 'identity_state.keys includes the tablet', String(state(w, s.maria.id).keys.includes(tablet.pub)));
  Q(S, 'key_timeline voice/under for the tablet', JSON.stringify(fb.door('key_timeline', s.maria.id, w.blocks).filter(e => e.key === tablet.pub).map(e => ({ voice: e.voice, under: e.under === s.maria.key.pub ? 'phone' : e.under }))));
  const tk = t.write('grant', { kind: 'key', voices: [{ key_hash: 'a'.repeat(64) }] }, { subject: s.maria.id, updates: s.K1.hash, after: [Cu.hash] }, { at: day(35) });
  Q(S, 'signed_by_author(a key grant signed by the tablet) a key under a voice signs no key grant', String(sba(w, tk)));
  // a stop by a voice above (the card? the relatives) of the adding key grant: use the phone itself (same voice)
  const stop = s.maria.write('grant', { kind: 'key', status: 'stopped', stop: 'onward' }, { updates: U.hash, after: [Cu.hash] }, { at: day(36) });
  const t2 = t.write('thing', { name: 'tablet after the stop' }, { after: [stop.hash] }, { at: day(37) });
  Q(S, 'signed_by_author(tablet block that has the stop of its key grant in its past)', String(sba(w, t2)));
}
{
  const S = '11 a lower voice changing its own wait';
  const s = M.setup(), { w } = s;
  const K = s.maria.write('grant', { kind: 'key', voices: [s.voices[0], s.voices[1], { key: s.maria.key.pub, wait: 'PT0S', reach: 'P1D' }], keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(5) });
  confirm(s.maria, K, [], day(5, 0, 1));
  Q(S, 'stands(a list by the phone that changes its own wait to zero), signed twice', asked(w, K));
  const K2 = s.maria.write('grant', { kind: 'key', voices: [s.voices[0], { names: s.voices[1].names, needed: 1, wait: 'PT0S' }, s.voices[2]], keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(6) });
  Q(S, 'stands(a list by the phone that changes a voice above it)', asked(w, K2));
  const K3 = s.maria.write('grant', { kind: 'key', voices: [s.voices[0], s.voices[1], s.voices[2]], keepers: { names: [s.keepers.names[0]] } }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(7) });
  Q(S, 'stands(a list by the phone that changes keepers: only the first voice may)', asked(w, K3));
}
// ---------------------------------------------------------------- 12. the shapes: a key grant that takes only its own place out, an encryption key, a closed identity
{
  const S = '12 shapes';
  const s = M.setup(), { w } = s;
  const out = s.maria.write('grant', { kind: 'key', voices: [s.voices[0], s.voices[1]], keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(5) });
  Q(S, 'stands(a key grant of the phone that only takes the phone\'s own place out), signed once', asked(w, out));
  Q(S, 'identity_state keys after it (the phone is out)', String(state(w, s.maria.id).keys.includes(s.maria.key.pub)));
  const late = s.maria.write('thing', { name: 'after it' }, { after: [out.hash] }, { at: day(6) });
  Q(S, 'signed_by_author(a phone block that has the standing key grant that took the phone out in its past)', String(sba(w, late)));
}
{
  const S = '12b encryption key';
  const s = M.setup(), { w } = s;
  const encOk = s.maria.write('grant', { kind: 'key', public_key_encrypt: '1'.repeat(64) }, { subject: s.maria.id }, { at: day(6, 1) });
  Q(S, 'stands(a key grant that states only an encryption key), signed once', asked(w, encOk));
}
{
  const S = '12c a closed identity';
  const w = new World(); const a = person(w, 'closing');
  const close = a.write('grant', { kind: 'key', voices: [] }, { subject: a.id, updates: a.id }, { at: day(1) });
  Q(S, 'stands(a key grant that leaves no voice), signed once', asked(w, close));
  const after = a.write('thing', { name: 'after' }, {}, { at: day(2) });
  Q(S, 'signed_by_author(a block after the list with no voice left)', String(sba(w, after)));
  Q(S, 'identity_state.voices / keys', JSON.stringify([state(w, a.id).voices.length, state(w, a.id).keys.length]));
}
// ---------------------------------------------------------------- 13. the short reply (profiles/short-form.md)
{
  const S = '13 short reply';
  const crypto = require('crypto');
  const w = new World(); const bob = person(w, 'bob'), maria = person(w, 'sr-maria'), host = person(w, 'sr-host');
  const O1 = bob.write('promise', { what: 'bread', terms: { price: { value: '3', unit: 'GBP' } } }, {}, { at: day(0) });
  const O2 = bob.write('promise', { what: 'bread', terms: { price: { value: '3', unit: 'GBP' } } }, {}, { at: day(0, 1) });
  const RB = host.write('observe', { kind: 'readback', readback: crypto.createHash('sha256').update('the terms, read back, 42').digest('hex') }, { for: O1.hash }, { at: day(0, 2) });
  const seq = 1, at = day(1);
  const block = { type: 'promise', state: { at, audience: 'public', seq, status: 'accepted' }, refs: { answers: O1.hash, author: maria.id, derives_from: [RB.hash], for: O1.hash, prev: maria.id } };
  const sig = fb.signBlock(block, maria.key.priv, 'std');
  const ms = Buffer.alloc(6); ms.writeUIntBE(Date.parse(at), 0, 6);
  const bytes = (codeOf, sig_) => Buffer.concat([Buffer.from(sig_, 'hex'), Buffer.from(codeOf.hash, 'hex').subarray(0, 5), Buffer.from([1]), ms, Buffer.from([seq])]);
  const text = 'FB1 ' + bytes(O1, sig).toString('base64url');
  const r = fb.door('short_reply_open', text, maria.id, [...w.blocks, RB]);
  Q(S, 'short_reply: answer, valid codes, id equals the id of the template block', r ? `${r.state.status} ${JSON.stringify(fb.door('valid', r, [...w.blocks, RB]).map(x => x.code))} ${r.hash === fb.hashOfBlock(block, 'std')}` : 'null');
  Q(S, 'the reply is how many characters', String(text.length));
  // moved to another offer of the same price: the same signature, the code of O2
  const moved = { ...block, refs: { ...block.refs, answers: O2.hash, for: O2.hash } };
  const m = fb.door('valid', { hash: fb.hashOfBlock(moved, 'std'), ...moved, signature: sig }, [...w.blocks, { ...RB }]);
  Q(S, 'valid(the same signature on the template for the other offer)', JSON.stringify(m.map(x => x.code + ': ' + x.detail)));
  Q(S, 'short_reply with the code of the other offer', String(fb.door('short_reply_open', 'FB1 ' + bytes(O2, sig).toString('base64url'), maria.id, [...w.blocks, RB])));
  // a second key (refs.key) of hers answers: a list with one more key, brought in by a key grant
  const k2 = key('sr-key2');
  const K = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: k2.pub }] }, { subject: maria.id, updates: maria.id }, { at: day(2) });
  const C = confirm(maria, K, [], day(2, 0, 1));
  const s2 = maria.asKey(k2, K.hash);
  const block2 = { type: 'promise', state: { at: day(3), audience: 'public', seq: 1, status: 'accepted' }, refs: { answers: O1.hash, author: maria.id, derives_from: [RB.hash], for: O1.hash, key: K.hash, prev: K.hash } };
  const sig2 = fb.signBlock(block2, k2.priv, 'std');
  const ms2 = Buffer.alloc(6); ms2.writeUIntBE(Date.parse(day(3)), 0, 6);
  const text2 = 'FB1 ' + Buffer.concat([Buffer.from(sig2, 'hex'), Buffer.from(O1.hash, 'hex').subarray(0, 5), Buffer.from([1]), ms2, Buffer.from([1])]).toString('base64url');
  const r2 = fb.door('short_reply_open', text2, maria.id, [...w.blocks, RB]);
  Q(S, 'short_reply by her second key (refs.key from her list, prev the key grant)', r2 ? `${r2.state.status} ${JSON.stringify(fb.door('valid', r2, [...w.blocks, RB]).map(x => x.code))}` : 'null');
  // a decline: an observe with no derives_from and (here) no at
  const dblock = { type: 'observe', state: { audience: 'public', seq: 2, status: 'declined' }, refs: { answers: O2.hash, author: maria.id, for: O2.hash, prev: 'x' } };
  Q(S, 'short_code(O1) is XXXX-XXXX', fb.door('short_code', O1.hash));
  Q(S, 'code_matches(lower case, no hyphen, O for 0)', String(fb.door('code_matches', fb.door('short_code', O1.hash).replace('-', '').toLowerCase().replace(/0/g, 'o'), O1.hash)));
}
// ---------------------------------------------------------------- 14. a voice with no wait brings in nothing by itself; a voice above must sign
{
  const S = '14 a voice with no wait';
  const w = new World(); const a = person(w, 'nw-a'); const card = key('nw-card'), tool = key('nw-tool');
  const L1 = [{ key_hash: fb.keyHash(card.pub) }, { key: a.key.pub }];
  const K1 = a.write('grant', { kind: 'key', voices: L1 }, { subject: a.id, updates: a.id }, { at: day(0) });
  const C1 = confirm(a, K1, [], day(0, 0, 1));
  const K2 = a.write('grant', { kind: 'key', voices: [...L1, { key: tool.pub }] }, { subject: a.id, updates: K1.hash }, { at: day(1) });
  confirm(a, K2, [], day(1, 0, 1));
  Q(S, 'stands(K2) a key grant by a voice that states no wait (place 1), signed twice by the same key', asked(w, K2));
  const showing = new Signer(w, a.id, card, K1.hash, K1.hash);
  const show = showing.write('grant', { kind: 'key', shown_key: card.pub, voices: L1 }, { subject: a.id, updates: K1.hash }, { at: day(2), see: C1 });
  showing.kg = show.hash;
  confirm(showing, K2, [], day(2, 1));
  Q(S, 'stands(K2) the voice above (the card, shown) signs it', asked(w, K2));
}
// ---------------------------------------------------------------- 15. an operator (a voice above a machine's whole list, wait zero)
{
  const S = '15 operator';
  const w = new World(); const oper = person(w, 'op-oper'), mach = person(w, 'op-machine', { kind: 'machine' });
  const OG = oper.write('grant', { kind: 'operator' }, { to: mach.id }, { at: day(0) });
  const acc = mach.write('grant', { status: 'accepted' }, { answers: OG.hash, for: OG.hash }, { at: day(0, 1) });
  const ogc = confirm(oper, OG, [], day(0, 2)); // a grant is signed twice (rule 13)
  const nk = key('op-newkey');
  const K = oper.write('grant', { kind: 'key', voices: [{ key: mach.key.pub }, { key: nk.pub }] }, { subject: mach.id, updates: mach.id, under: OG.hash, after: [acc.hash, ogc.hash] }, { at: day(1) });
  Q(S, 'stands(operator\'s key grant for the machine) signed once', asked(w, K));
  confirm(oper, K, [acc, ogc], day(1, 0, 1));
  Q(S, 'stands(operator\'s key grant) the operator\'s key confirms it (wait zero)', asked(w, K));
  Q(S, 'identity_state.operators of the machine', JSON.stringify(state(w, mach.id).operators.map(x => x === oper.id)));
  const stranger = person(w, 'op-stranger');
  const K2 = stranger.write('grant', { kind: 'key', voices: [{ key: mach.key.pub }, { key: key('op-sk').pub }] }, { subject: mach.id, updates: mach.id }, { at: day(2) });
  confirm(stranger, K2, [], day(2, 0, 1));
  Q(S, 'stands(a stranger\'s key grant for the machine, no operator grant) signed twice', asked(w, K2));
}
// ---------------------------------------------------------------- 16. counted_to on a key with no reach (a relier used it unseen)
{
  const S = '16 counted_to, no reach';
  const w = new World(); const a = person(w, 'ct-a'), bob = person(w, 'ct-bob'), carl = person(w, 'ct-carl');
  const card = key('ct-card'), a2 = key('ct-a2');
  const L1 = [{ key_hash: fb.keyHash(card.pub) }, { key: a.key.pub, wait: 'PT0S' }];
  const K1 = a.write('grant', { kind: 'key', voices: L1 }, { subject: a.id, updates: a.id }, { at: day(0) });
  const C1 = confirm(a, K1, [], day(0, 0, 1));
  const X1 = a.write('promise', { what: 'on the line' }, {}, { at: day(1) });
  const X2 = a.write('promise', { what: 'off the line, used by a relier unseen' }, {}, { at: day(2) });
  const X3 = a.write('promise', { what: 'off the line, nobody used it' }, {}, { at: day(2, 1) });
  const acc = bob.write('promise', { what: 'on the line', status: 'accepted' }, { answers: X2.hash, for: X2.hash }, { at: day(2, 2) });
  const showing = new Signer(w, a.id, card, K1.hash, K1.hash);
  const Kc = showing.write('grant', { kind: 'key', shown_key: card.pub, voices: [L1[0], { key: a2.pub, wait: 'PT0S' }], counted_to: X1.hash }, { subject: a.id, updates: K1.hash }, { at: day(3), see: C1 });
  showing.kg = Kc.hash;
  confirm(showing, Kc, [], day(3, 0, 1));
  Q(S, 'stands(Kc) the card ends the key and names counted_to X1 (a key grant by a voice above)', asked(w, Kc));
  Q(S, 'stands(X1) on the counted line', asked(w, X1));
  Q(S, 'stands(X2) off the line, a relier used it before seeing the end', asked(w, X2));
  Q(S, 'stands(X3) off the line, nobody used it', asked(w, X3));
}
// ---------------------------------------------------------------- 17. a block signed by another key must name its key (refs.key)
{
  const S = '17 refs.key';
  const s = M.setup(), { w } = s;
  const nk = key('rk-new');
  const K2 = s.mum.write('grant', { kind: 'key', voices: M.withPhone(s, nk), keepers: s.keepers }, { subject: s.maria.id, updates: s.K1.hash }, { at: day(10), see: s.C1 });
  const np = s.maria.asKey(nk, K2.hash);
  const good = np.write('thing', { name: 'named its key' }, {}, { at: day(11) });
  const np2 = s.maria.asKey(nk, K2.hash);
  const bare = np2.write('thing', { name: 'names no key' }, {}, { at: day(11, 1), noKey: true });
  const wrong = s.maria.asKey(nk, K2.hash, undefined, s.K1.hash).write('thing', { name: 'names a grant that does not list the key' }, {}, { at: day(11, 2) });
  const held = w.blocks.filter(b => b !== good && b !== bare && b !== wrong);
  Q(S, 'valid(block with refs.key the key grant that lists the key)', JSON.stringify(fb.door('valid', good, held).map(r => r.code)));
  Q(S, 'valid(the same key, no refs.key)', JSON.stringify(fb.door('valid', bare, held).map(r => r.code)));
  Q(S, 'valid(refs.key naming a key grant that does not bring the key in)', JSON.stringify(fb.door('valid', wrong, held).map(r => r.code)));
}
// ---------------------------------------------------------------- 18. the planted grant, signed again by the phone after its thirty days
{
  const S = '18 phone confirms after its wait';
  const s = M.setup(), { w } = s, leila = person(w, 'p-leila');
  const G = s.maria.write('grant', { kind: 'agent', scope: { types: ['transfer'] } }, { to: leila.id }, { at: day(5) });
  const cl = M.closeWait(s, G, 'P30D', 30, day(5, 1));
  Q(S, 'stands(grant) two keepers cut off through receipt + P30D, the phone has not signed again', asked(w, G));
  confirm(s.maria, G, [cl.c1, cl.c2], day(36));
  Q(S, 'stands(grant) the phone signs it again after the 30 days have run', asked(w, G));
  const G2 = s.maria.write('grant', { kind: 'agent', scope: { types: ['transfer'] } }, { to: leila.id }, { at: day(40) });
  confirm(s.maria, G2, [], day(40, 0, 1));
  Q(S, 'stands(grant) the phone signs it again at once, before any wait has run', asked(w, G2));
}
// every block of every world is judged valid against its world (a refused block would be no one's word)
const { ALL, audit } = require('./lib.cjs');
ALL.forEach((w, i) => { const bad = audit(w); if (bad.length) console.log('INVALID in world', i, JSON.stringify(bad)); });
module.exports = { L };
