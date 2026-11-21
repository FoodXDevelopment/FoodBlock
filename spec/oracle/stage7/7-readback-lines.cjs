// C4 (changes-1.9/07-last.md): what a person sees, twenty lines. One case per line, with the exact text expected for `en` and `en-sms`.
// Each line copies one answer field. Names and units are copied as signed (1.9-GUESS [7-C4-units]): "GBP", never "£"; the table's "£210" is the figure, its unit as signed.
const L = require('./7-readback-lib.cjs'); const { fb, World, T, tg, nm, A, kindOf, instance, check, done, Pn, code, GBP, rb, gsm7 } = L;
const c = x => code(x.id || x.hash || x);
const per = (v, unit) => ({ amount: GBP(v), per: A('1', unit) });
// Harry's lot L7 of 10 sacks, in a world with Amara, Gita, Sam, Leila, FoodX
function base() {
  const w = new World(); const harry = Pn(w, 'harry'), amara = Pn(w, 'amara'), gita = Pn(w, 'gita'), sam = Pn(w, 'sam'), leila = Pn(w, 'leila'), foodx = Pn(w, 'foodx', 'FoodX');
  const flour = T(kindOf(harry, 'flour'), 'flour');
  const L7 = T(instance(harry, flour, { name: 'L7', pack: A('10', 'sacks') }), 'L7');
  return { w, harry, amara, gita, sam, leila, foodx, flour, L7 };
}
const offerL7 = (W, to, terms = { price: GBP(300) }, o = {}) => W.harry.write('promise', { terms, ...(o.state || {}) }, { from: W.harry.id, to: to.id, what: W.L7.hash }, o.at || {});
const both = (n, what, r, wantEn, wantSms) => { check('C4 line ' + n, what + ' (en)', r.en, wantEn); check('C4 line ' + n, what + ' (en-sms)', r.sms, wantSms); };
{ // 1 "yours": draw landed, shown to the receiver
  const W = base(); const { w, harry, amara, L7 } = W;
  const t = harry.write('transfer', {}, { what: L7.hash, to_owner: amara.id }); amara.write('transfer', { status: 'accepted' }, { answers: t.hash });
  both(1, 'Harry\'s transfer of L7 to Amara, her yes: yours', rb(t, w.blocks, amara),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): yours.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: yours.`);
}
{ // 2 "kept for you, in Harry's hands, on his record as you hold it" (and 9 "10 sacks, on Harry's word"): held, the signer holds
  const W = base(); const { w, harry, amara, L7 } = W; const H2 = offerL7(W, amara);
  both(2, 'Harry offers L7 to Amara: held in his hands; whose word frees it (her no) is named', rb(H2, w.blocks, amara),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): 10 sacks, on Harry's word.\nL7: kept for you, in Harry's hands, on Harry's record as you hold it, until you say no.\nYou pay at most 300 GBP in all.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: 10 sacks, Harry's word. L7: kept for you in Harry's hands till you say no. You pay max 300 GBP.`);
  both(2, 'the same, to Harry: kept for Amara, in his hands, until she says no', rb(H2, w.blocks, harry),
    `To Amara (${c(amara)}).\nL7 (${c(L7)}): kept for Amara, in your hands, until Amara says no.\nYou may be paid as little as 300 GBP.`,
    `To Amara ${c(amara)}: L7 ${c(L7)}: kept for Amara in your hands till Amara says no. You may get as little as 300 GBP.`);
}
{ // 3 "held for you by Gita": held, a holder holds; shown to the receiver and the payer
  const W = base(); const { w, harry, amara, gita, L7 } = W;
  const t = harry.write('transfer', {}, { what: L7.hash, to_owner: amara.id, to_holder: gita.id });
  both(3, 'L7 to Amara, held by Gita: to Amara', rb(t, w.blocks, amara),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): 10 sacks, on Harry's word.\nL7: held for you by Gita (${c(gita)}), until you say no.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: 10 sacks, Harry's word. L7: held for you by Gita ${c(gita)} till you say no.`);
  both(3, 'the same, to Harry (the payer)', rb(t, w.blocks, harry),
    `To Amara (${c(amara)}).\nL7 (${c(L7)}): held for Amara by Gita (${c(gita)}), until Amara says no.`,
    `To Amara ${c(amara)}: L7 ${c(L7)}: held for Amara by Gita ${c(gita)} till Amara says no.`);
}
{ // 4 "Harry's word; nothing set aside": draw null, the other side only
  const W = base(); const { w, harry, amara, flour } = W;
  const order = amara.write('promise', { terms: { quantity: A('10', 'sacks'), price: GBP(300) } }, { from: harry.id, to: amara.id, what: flour.hash });
  both(4, 'Amara orders 10 sacks of flour (a kind) for 300 GBP: to Harry, her 300 is her word, nothing set aside', rb(order, w.blocks, harry),
    `From Amara (${c(amara)}).\nFirst deal with this buyer.\n300 GBP to you: Amara's word; nothing set aside.\nYou may be paid as little as 300 GBP.`,
    `Amara ${c(amara)}: First deal with this buyer. 300 GBP to you: Amara's word; nothing set aside. You may get as little as 300 GBP.`);
  both(4, 'the same, to Amara: never told that her own word keeps nothing aside', rb(order, w.blocks, amara),
    `To Harry (${c(harry)}).\nYou pay at most 300 GBP in all.`,
    `To Harry ${c(harry)}: You pay max 300 GBP.`);
  const offer = harry.write('promise', { terms: { quantity: A('10', 'sacks'), price: GBP(300) } }, { from: harry.id, to: amara.id, what: flour.hash });
  both(4, 'Harry offers 10 sacks of a kind: to Amara, his word, nothing set aside', rb(offer, w.blocks, amara),
    `From Harry (${c(harry)}).\nflour (${c(flour)}), 10 sacks: Harry's word; nothing set aside.\nYou pay at most 300 GBP in all.`,
    `Harry ${c(harry)}: flour ${c(flour)} 10 sacks: Harry's word; nothing set aside. You pay max 300 GBP.`);
}
{ // 5 "can't tell yet: 1 of Harry's blocks is missing": not_shown, lacks; 6 "not Harry's to give: already another's": past
  const W = base(); const { w, harry, amara, sam, L7 } = W;
  const S = harry.write('transfer', {}, { what: L7.hash, to_owner: sam.id }); const SY = sam.write('transfer', { status: 'accepted' }, { answers: S.hash });
  const H2 = offerL7(W, amara);
  const lacking = w.blocks.filter(b => b.hash !== S.hash && b.hash !== SY.hash);
  const r5 = rb(H2, lacking, amara);
  check('C4 line 5', 'the answer: not_shown, lacks [S]', [r5.a.things[0].draw.not_shown, r5.a.things[0].draw.lacks.map(tg)], [true, [S.hash.slice(0, 6)]]);
  both(5, 'Amara lacks Harry\'s sale to Sam', r5,
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): can't tell yet: 1 of Harry's blocks is missing.\nYou pay at most 300 GBP in all.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: can't tell yet; 1 of Harry's blocks missing. You pay max 300 GBP.`);
  both(6, 'Amara holds the sale: not Harry\'s to give', rb(H2, w.blocks, amara),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): not Harry's to give: already another's.\nYou pay at most 300 GBP in all.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: not Harry's to give. You pay max 300 GBP.`);
}
{ // 7 "Harry signed it twice. Neither is shown as yours.": pair, each receiver
  const W = base(); const { w, harry, amara, leila, L7 } = W;
  const head = harry.head, seq = harry.seq;
  const X1 = offerL7(W, amara); const X2 = harry.write('promise', { terms: { price: GBP(300) } }, { from: harry.id, to: leila.id, what: L7.hash }, { prev: head, seq: seq + 1 });
  both(7, 'L7 offered twice, to Amara and to Leila: to Leila', rb(X2, w.blocks, leila),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): Harry signed it twice. Neither is shown as yours.\nYou pay at most 300 GBP in all.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: Harry signed it twice; neither shown as yours. You pay max 300 GBP.`);
}
{ // 8 "freed: Harry may sell it again": freed, both
  const W = base(); const { w, harry, amara, L7 } = W; const H2 = offerL7(W, amara);
  amara.write('observe', { status: 'declined' }, { answers: H2.hash });
  both(8, 'Amara declines: freed, to Amara', rb(H2, w.blocks, amara),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): freed: Harry may sell it again.\nYou pay at most 300 GBP in all.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: freed; Harry may sell it again. You pay max 300 GBP.`);
  both(8, 'the same, to Harry', rb(H2, w.blocks, harry),
    `To Amara (${c(amara)}).\nL7 (${c(L7)}): freed: you may sell it again.\nYou may be paid as little as 300 GBP.`,
    `To Amara ${c(amara)}: L7 ${c(L7)}: freed; you may sell it again. You may get as little as 300 GBP.`);
}
{ // 9 "10 sacks, on Harry's word": who stated the instance; Mill Lane states the lot, Harry offers it (the stater is the instance's signer, not the offerer)
  const W = base(); const { w, harry, amara, L7 } = W; const H2 = offerL7(W, amara);
  check('C4 line 9', 'the line names who stated the instance (en)', rb(H2, w.blocks, amara).en.split('\n')[2], `L7 (${c(L7)}): 10 sacks, on Harry's word.`);
}
{ // 10 "You pay at most £210 in all" / "You may be paid as little as £88": per side, per kind, both ends of every range
  const w = new World(); const maria = Pn(w, 'maria'), amara = Pn(w, 'amara'); const rye = kindOf(maria, 'rye');
  const o = maria.write('promise', { terms: { quantity: { min: A('80', 'kg'), max: A('100', 'kg') }, price: { min: per('1.10', 'kg'), max: per('2.10', 'kg') } } }, { from: maria.id, to: amara.id, what: rye.hash });
  const ra = rb(o, w.blocks, amara), rm = rb(o, w.blocks, maria);
  check('C4 line 10', 'the answer: Amara out at most 210 GBP, in at least 80 kg; Maria out at most 100 kg, in at least 88 GBP', ra.a.amounts.map(s => [nm(s.side.id), s.out, s.in]).sort(),
    [['amara', [GBP(210)], [A('80', 'kg')]], ['maria', [A('100', 'kg')], [GBP(88)]]].sort());
  both(10, 'to Amara, the buyer', ra, `From Maria (${c(maria)}).\nFirst deal with this seller.\nYou pay at most 210 GBP in all.`, `Maria ${c(maria)}: First deal with this seller. You pay max 210 GBP.`);
  both(10, 'to Maria, the seller', rm, `To Amara (${c(amara)}).\nYou may be paid as little as 88 GBP.`, `To Amara ${c(amara)}: You may get as little as 88 GBP.`);
}
// the grant world of stage 4 (04-grants.md section 5, W): Amara's want A1, her grant G to her AI under clocks FoodX and Wanjiru (needed 2), limit £210, meter Wanjiru
function grantWorld(o = {}) {
  const w = new World(); const amara = Pn(w, 'amara'), ai = Pn(w, 'amara-ai', "Amara's AI"), foodx = Pn(w, 'foodx', 'FoodX'), wan = Pn(w, 'wanjiru'), harry = Pn(w, 'harry');
  const F = kindOf(amara, 'flour');
  const A1 = amara.write('promise', { terms: { quantity: A('10', 'sack'), price: { max: per(21, 'sack') }, pay_by: { min: 'P3D' } } }, { to: amara.id, what: F.hash });
  const clocks = o.clocks ? o.clocks({ foodx, wan }) : { names: [foodx.id, wan.id].sort(), needed: 2 };
  const G = amara.write('grant', { kind: 'tool', scope: { types: ['promise', 'observe', 'transfer'], on: [A1.hash], parties: [harry.id], limit: GBP(210), clocks } }, { to: ai.id, meter: o.own ? ai.id : wan.id });
  return { w, amara, ai, foodx, wan, harry, A1, G };
}
{ // 11 "It can give away nothing of yours"; 10 at a grant; 14 the clocks by name; 20 FoodX's own line, at a grant that pays
  const W = grantWorld(); const { w, amara, ai, foodx, wan, G } = W;
  const r = rb(G, w.blocks, amara);
  const pp = [[foodx, 'FoodX'], [wan, 'Wanjiru']].sort((x, y) => (x[0].id < y[0].id ? -1 : 1));
  const ck = pp.map(([p, n]) => `${n} (${c(p)})`), cks = pp.map(([p, n]) => `${n} ${c(p)}`);
  both('11, 10, 14, 20', 'Amara\'s grant to her AI', r,
    `To Amara's AI (${c(ai)}).\nYou pay at most 210 GBP in all.\nIt can give away nothing of yours.\n${ck[0]} and ${ck[1]} must both hear each deal. If either is silent, deals wait.\nWhat it can move on your bank is your bank's limit, not this.`,
    `To Amara's AI ${c(ai)}: You pay max 210 GBP. It can give away nothing of yours. ${cks[0]} and ${cks[1]} must both hear each deal. Your bank's limit, not this, caps what it moves there.`);
}
{ // 12 "a copied key could show this to several sellers": the meter is the holder's own key
  const W = grantWorld({ own: true }); const { w, amara } = W;
  check('C4 line 12', 'the AI\'s own key as meter (en)', rb(W.G, w.blocks, amara).en.split('\n').includes('A copied key could show this to several sellers.'), true);
  check('C4 line 12', 'with Wanjiru as meter, the line is not said', rb(grantWorld().G, grantWorld().w.blocks, grantWorld().amara).en.includes('copied key'), false);
}
{ // 11b "...up to these 40 loaves"; 13 "Your till may sell for as little as £3 a loaf. Every buyer can read this."
  const w = new World(); const maria = Pn(w, 'maria'), till = Pn(w, 'till', 'Till'), leila = Pn(w, 'leila');
  const loaf = kindOf(maria, 'loaf'), li = instance(maria, loaf, { name: 'loaves', pack: A('40', 'loaves') });
  const ML = maria.write('promise', { terms: { quantity: A('40', 'loaves'), price: { min: per(3, 'loaves') } } }, { from: maria.id, what: li.hash });
  const GT = maria.write('grant', { kind: 'tool', scope: { types: ['promise', 'transfer'], on: [ML.hash], parties: [leila.id] } }, { to: till.id, meter: till.id, what: li.hash });
  const r = rb(GT, w.blocks, maria);
  // G18: the line copies stage 4's `at_most` whatever it is. (The `on` promise and refs.what name the same 40 loaves; stage 4's worst_case counts them as two measures and gives 80. Whether that is the
  // most a block under it can bind her to hand over is a question for stage 4's text: stage7-oracle-silent.md, conflict 2.)
  check('C4 line 10 at a grant (stage 4, G18)', 'the line copies worst_case.at_most', r.a.grant.hand_over_at_most, fb.door('worst_case', GT, w.blocks).at_most);
  const noAtMost = x => ({ en: x.en.split('\n').filter(l => !l.startsWith('You hand over')).join('\n'), sms: x.sms.replace(/You hand over max [^.]*\. /, '') });
  both('11b, 13', 'Maria\'s till grant: 40 loaves it can give away; the floor, public (the at_most line is asked above)', noAtMost(r),
    `To Till (${c(till)}).\nYou hand over at most 40 loaves in all.\nIt can give away up to these 40 loaves.\nA copied key could show this to several sellers.\nTill may sell for as little as 3 GBP per 1 loaves. Every buyer can read this.\nWhat it can move on your bank is your bank's limit, not this.`.replace('You hand over at most 40 loaves in all.\n', ''),
    `To Till ${c(till)}: You hand over max 40 loaves. It can give away up to 40 loaves. A copied key could show this to several sellers. Till may sell at 3 GBP per 1 loaves or more; every buyer sees it. Your bank's limit, not this, caps what it moves there.`.replace('You hand over max 40 loaves. ', ''));
}
{ // 15 "Only FoodX hears your STOP; if it misses it, FoodX pays you back.": one clock, FoodX's promise
  const W = grantWorld({ clocks: ({ foodx }) => ({ names: [foodx.id], needed: 1 }) }); const { w, amara, ai, foodx, G } = W;
  const plain = rb(G, w.blocks, amara);
  check('C4 line 15', 'one clock, no promise of FoodX: who hears her STOP, and nothing about paying back', plain.en.split('\n')[3], `Only FoodX (${c(foodx)}) hears your STOP.`);
  foodx.write('promise', { terms: { backing: GBP(210) } }, { from: foodx.id, to: amara.id, for: G.hash });
  both(15, 'with FoodX\'s own promise for the grant (terms.backing)', rb(G, w.blocks, amara),
    `To Amara's AI (${c(ai)}).\nYou pay at most 210 GBP in all.\nIt can give away nothing of yours.\nOnly FoodX (${c(foodx)}) hears your STOP; if it misses it, FoodX pays you back.\nWhat it can move on your bank is your bank's limit, not this.`,
    `To Amara's AI ${c(ai)}: You pay max 210 GBP. It can give away nothing of yours. Only FoodX ${c(foodx)} hears your STOP; if it misses it, FoodX pays you back. Your bank's limit, not this, caps what it moves there.`);
}
{ // 16 "done when he says so": the term, as the term
  const W = base(); const { w, harry, amara, L7 } = W; const H2 = offerL7(W, amara, { price: GBP(300), waits_on: 'price' });
  both(16, 'waits_on price: the goods wait on Harry\'s word that he is paid', rb(H2, w.blocks, amara),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nL7 (${c(L7)}): 10 sacks, on Harry's word.\nL7: kept for you, in Harry's hands, on Harry's record as you hold it, until you say no.\nYou pay at most 300 GBP in all.\nDone when Harry says so.`,
    `Harry ${c(harry)}: First deal with this seller. L7 ${c(L7)}: 10 sacks, Harry's word. L7: kept for you in Harry's hands till you say no. You pay max 300 GBP. Done when Harry says so.`);
}
{ // 17 "an id you have no name for (JYR9-Z9VR)" / "first deal with this seller": short code; her own record
  const w = new World(); const ravi = Pn(w, 'ravi', null), amara = Pn(w, 'amara'); const crates = kindOf(ravi, 'crates');
  const o = ravi.write('promise', { terms: { quantity: A('10', 'crates'), price: A('550', 'KES') } }, { from: ravi.id, to: amara.id, what: crates.hash });
  both(17, 'a stranger who signed no name, a first deal', rb(o, w.blocks, amara),
    `From an id you have no name for (${c(ravi)}).\nFirst deal with this seller.\ncrates (${c(crates)}), 10 crates: that id's word; nothing set aside.\nYou pay at most 550 KES in all.`,
    `Unnamed id ${c(ravi)}: First deal with this seller. crates ${c(crates)} 10 crates: that id's word; nothing set aside. You pay max 550 KES.`);
  const W = base(); const { harry, flour } = W; const w2 = W.w;
  W.amara.write('promise', { terms: { quantity: A('1', 'sacks'), price: GBP(30) } }, { from: harry.id, to: W.amara.id, what: flour.hash });
  const H2 = offerL7(W, W.amara);
  check('C4 line 17', 'an earlier deal with Harry in her record: no first-deal line', rb(H2, w2.blocks, W.amara).en.includes('First deal'), false);
}
{ // 18 "3 readers; you can see only yourself": sealed audience, a side not the author
  const W = base(); const { w, harry, amara, flour } = W;
  const o = harry.write('promise', { audience: ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)], nonce: 'd'.repeat(32), terms: { quantity: A('10', 'sacks'), price: GBP(300) } }, { from: harry.id, to: amara.id, what: flour.hash });
  both(18, 'Harry\'s sealed offer to Amara, three readers', rb(o, w.blocks, amara),
    `From Harry (${c(harry)}).\nFirst deal with this seller.\n3 readers; you can see only yourself.\nflour (${c(flour)}), 10 sacks: Harry's word; nothing set aside.\nYou pay at most 300 GBP in all.`,
    `Harry ${c(harry)}: First deal with this seller. 3 readers; you see only yourself. flour ${c(flour)} 10 sacks: Harry's word; nothing set aside. You pay max 300 GBP.`);
}
{ // 19 "Your reader does not read one field here, so it cannot say what this binds you to. Nothing was guessed.": not_read, and nothing else
  const W = base(); const { w, harry, amara, L7 } = W;
  const o = offerL7(W, amara, { price: GBP(300), wibble: 'x' });
  const r = rb(o, w.blocks, amara);
  check('C4 line 19', 'the answer: not_read counting one field (a refusal\'s detail is never read), and no other line', [r.a.not_read && r.a.not_read.fields, 'things' in r.a], [1, false]);
  both(19, 'a term this reader does not read', r,
    `From Harry (${c(harry)}).\nYour reader does not read one field here, so it cannot say what this binds you to. Nothing was guessed.`,
    `Harry ${c(harry)}: your reader can't read 1 field here; nothing guessed.`);
  const o2 = offerL7(W, amara, { price: GBP(300) }, { state: { rule_set: 'e'.repeat(64) } });
  both(19, 'a rule set this reader does not run: no hash printed', rb(o2, w.blocks, amara),
    `From Harry (${c(harry)}).\nYour reader does not read the rules this names, so it cannot say what this binds you to. Nothing was guessed.`,
    `Harry ${c(harry)}: your reader can't read the rules this names; nothing guessed.`);
}
{ // a block whose signature does not open: said so, and nothing else; a block whose pieces she lacks: can't tell yet, the pieces in lacks
  const W = base(); const { w, harry, amara } = W; const H2 = offerL7(W, amara);
  const bad = { ...H2, signature: (H2.signature[0] === '0' ? '1' : '0') + H2.signature.slice(1) };
  check('C4 (not valid)', 'a bad signature', L.en(L.R.readback(bad, w.blocks, amara.id)), `From Harry (${c(harry)}).\nNo key signed this as it stands.`);
  const a = L.R.readback(H2, [H2], amara.id);
  check('C4 (pieces not held)', 'Harry\'s genesis not held: not_shown, lacks it', [a.not_shown, a.lacks], [true, [harry.id]]);
  check("C4 (pieces not held)", "the text", L.en(a), `From an id you have no name for (${c(harry)}).\nCan't tell yet: 1 of that id's blocks is missing.`);
}
{ // the deal's own words (`state.what`, free text): quoted word for word, marked as its signer's, never read (2026-11-20)
  const W = base(); const { w, harry, amara, L7 } = W;
  const o = harry.write('promise', { what: '20 kg tomatoes', terms: { price: GBP(40) } }, { from: harry.id, to: amara.id });
  const r = rb(o, w.blocks, amara);
  check('C4 (her words)', 'the answer quotes state.what as signed, by its signer', [r.a.what.text, r.a.what.by.id], ['20 kg tomatoes', harry.id]);
  both('(her words)', 'Harry offers Amara "20 kg tomatoes" for 40 GBP', r,
    `From Harry (${c(harry)}).\nFirst deal with this seller.\nIn Harry's words: "20 kg tomatoes".\nYou pay at most 40 GBP in all.`,
    `Harry ${c(harry)}: First deal with this seller. In Harry's words: "20 kg tomatoes". You pay max 40 GBP.`);
  check('C4 (her words)', 'to Harry, his own words', rb(o, w.blocks, harry).en, `To Amara (${c(amara)}).\nIn your words: "20 kg tomatoes".\nYou may be paid as little as 40 GBP.`);
  // en-sms: a text longer than 160 characters runs whole over several texts, in order, split at a space (en-sms.md, Texts)
  const o2 = offerL7(W, amara, { price: GBP(300) }, { state: { what: 'ten sacks of stoneground wholemeal, spring harvest, from the yard gate on Saturday' } });
  const m = fb.door('readback', o2, w.blocks, amara.id, 'en-sms', '47');
  check('C4 (texts)', 'her second deal (no first-deal line): two texts, each at most 160 characters, nothing dropped', [m.texts, m.texts.join(' ') === m.text, m.texts.every(t => [...t].length <= 160)], [[
    `Harry ${c(harry)}: In Harry's words: "ten sacks of stoneground wholemeal, spring harvest, from the yard gate on Saturday". L7 ${c(L7)}: 10 sacks, Harry's word.`,
    `L7: kept for you in Harry's hands till you say no. You pay max 300 GBP. 47`], true, true]);
  check('C4 (texts)', 'a short one is one text', fb.door('readback', o, w.blocks, amara.id, 'en-sms').texts, [`Harry ${c(harry)}: In Harry's words: "20 kg tomatoes". You pay max 40 GBP.`]);
  check('C4 (texts)', 'en gives no texts', 'texts' in fb.door('readback', o, w.blocks, amara.id, 'en'), false);
}
done();
