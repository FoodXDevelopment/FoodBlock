// Worlds A to D: the read-back that can be redone. A redo; a lying host; a lacking reader; a pair.
const L = require('./lib.cjs'); const { fb, World, T, tg, nm, A, kindOf, instance, check, done, Pn, code, GBP, rb, R, en, enSms, RD, gsm7 } = L;
// World A: (1) Harry H0, H1 lot L7 10 sacks. (2) Harry H2 offers L7 to Amara at £300.
function worldA() {
  const w = new World(); const harry = Pn(w, 'harry'), amara = Pn(w, 'amara'), foodx = Pn(w, 'foodx', 'FoodX'), wan = Pn(w, 'wanjiru'), leila = Pn(w, 'leila');
  const flour = kindOf(harry, 'flour');
  const H1 = T(instance(harry, flour, { name: 'L7', pack: A('10', 'sacks') }), 'H1');
  const H2 = T(harry.write('promise', { terms: require('../kit.cjs').linesFor(H1, { price: GBP(300) }) }, { from: harry.id, to: amara.id }), 'H2');
  const H0 = w.blocks.filter(b => b.refs.author === harry.id && b.type === 'actor').concat(w.blocks.filter(b => b.hash === harry.id)).map(b => b.hash); // Harry's genesis and the block he signs his name in
  // the block before H1 on Harry's line (his kind `flour`): where H1 sits on his line is read from it, so the reading reads it (`prev`)
  H0.push(flour.hash);
  return { w, harry, amara, foodx, wan, leila, flour, H0, H1, H2 };
}
const RBk = (b, held, to, renderer, digits) => fb.door('readback', b, held, to, renderer, digits);
const redo = (rb, held) => fb.door('readback_redo', rb, held);
const ids = l => l.map(x => (typeof x === 'string' ? (nm(x) !== x.slice(0, 6) ? nm(x) : tg(x)) : x));
{
  const W = worldA(); const { w, harry, amara, foodx, H0, H1, H2 } = W;
  // (3) FoodX signs RB, an observe of kind readback for H2: reading r, renderer en, read [H0, H1, H2], digits 47
  const m = RBk(H2, w.blocks, amara.id, 'en', '47');
  const RB = T(foodx.write('observe', m.state, { for: H2.hash, to: amara.id }), 'RB');
  // the read-back names the blocks it read in `state.read` (a make's `state.inputs` is a different thing)
  check('world A', 'the readback is valid and read (its list of ids is `state.read`, the answer\'s `read`; a make keeps `state.inputs`)', [fb.door('valid', RB, w.blocks).length, fb.door('read', RB, w.blocks).map(x => x.code)], [0, []]);
  check('world A', 'its `read` is the sorted ids the reading read: H0 (Harry\'s genesis, his own name block and his kind before H1 on his line), H1, H2', RB.state.read, [...H0, H1.hash, H2.hash].sort());
  check('world A', 'its `read` is exactly the answer\'s', RB.state.read, m.answer.read);
  check('world A', 'its reading and renderer are named as rule sets are: the manifest of each published text and its cases', [RB.state.reading, RB.state.renderer], [RD.names().reading, RD.names().en]);
  check('world A', 'the text the host sends: the renderer\'s output, then the digits', m.text,
    `From Harry (${code(harry.id)}).\nFirst deal with this seller.\nL7 (${code(H1.hash)}): 10 sacks, on Harry's word.\nL7: kept for you, in Harry's hands, on Harry's record as you hold it, until you say no.\nYou pay at most 300 GBP in all. 47`);
  check('world A', '`readback` is that text\'s digest', RB.state.readback, RD.digestOf(m.text));
  // Wanjiru's kiosk holds H0, H1, H2, runs r and en: the same digest
  const kiosk = w.blocks.filter(b => [...H0, H1.hash, H2.hash].includes(b.hash));
  check('world A', 'the kiosk holds H0, H1, H2: the same digest', redo(RB, kiosk), { same: true, readback: RB.state.readback, lacks: [], not_run: [] });
  check('world A', 'the kiosk holding much more (every block of the world): the same digest', redo(RB, w.blocks).same, true);
  check('world A', 'words after the digits are the host\'s own: the digest does not cover them', RD.digestOf(m.text + ' Reply 01 yes, 02 no.') === RB.state.readback, false);
  check('world A', 'the same redo holds with them sent: the kiosk redoes the covered part only', redo(RB, kiosk).same, true);
  // a reading or renderer this build does not run: named in not_run, no digest
  const other = { ...RB, state: { ...RB.state, renderer: '12'.repeat(32) } };
  check('world A', 'a renderer this build does not run: not_run names it, no digest', redo(other, kiosk), { same: null, readback: null, lacks: [], not_run: ['12'.repeat(32)] });
  // the en-sms read-back of the same block, as a decision text: at most 160 GSM-7 characters
  const ms = RBk(H2, w.blocks, amara.id, 'en-sms', '47');
  check('world A', 'the en-sms decision text', ms.text, `Harry ${code(harry.id)}: First deal with this seller. L7 ${code(H1.hash)}: 10 sacks, Harry's word. L7: kept for you in Harry's hands till you say no. You pay max 300 GBP. 47`);
  check('world A', 'it is at most 160 GSM-7 characters', gsm7(ms.text) <= 160, true);
}
{
  // World A as the text writes it, Harry signing no name: `read` is exactly [H0, H1, H2], and he is named by his short code
  const w = new World(); const harry = Pn(w, 'harry', null), amara = Pn(w, 'amara'), foodx = Pn(w, 'foodx', 'FoodX');
  const K = kindOf(harry, 'flour'); const H1 = T(instance(harry, K, { name: 'L7', pack: A('10', 'sacks') }), 'H1');
  const H2 = T(harry.write('promise', { terms: require('../kit.cjs').linesFor(H1, { price: GBP(300) }) }, { from: harry.id, to: amara.id }), 'H2');
  const m = RBk(H2, w.blocks, amara.id, 'en', '47');
  const RB = foodx.write('observe', m.state, { for: H2.hash, to: amara.id });
  check('world A, as written', 'Harry with no signed name: read [H0, H1, H2] (H0 his genesis and his kind before H1 on his line)', RB.state.read, [harry.id, K.hash, H1.hash, H2.hash].sort());
  check('world A, as written', 'the text names him by short code (17)', m.text.split('\n')[0], `From an id you have no name for (${code(harry.id)}).`);
  check('world A, as written', 'the kiosk holding H0, H1, H2: the same digest', redo(RB, w.blocks.filter(b => [harry.id, K.hash, H1.hash, H2.hash].includes(b.hash))).same, true);
}
{
  // World B (a lying host): the same, with FoodX's text "no price": the kiosk's digest differs
  const W = worldA(); const { w, harry, amara, foodx, H0, H1, H2 } = W;
  const honest = RBk(H2, w.blocks, amara.id, 'en', '47');
  const lie = 'From Harry. L7, 10 sacks, no price. 47';
  const RB = T(foodx.write('observe', { ...honest.state, readback: RD.digestOf(lie) }, { for: H2.hash, to: amara.id }), 'RB-lie');
  const kiosk = w.blocks.filter(b => [...H0, H1.hash, H2.hash].includes(b.hash));
  const r = redo(RB, kiosk);
  check('world B', 'the kiosk\'s digest differs from FoodX\'s: the lie is a fact anyone can show', [r.same, r.readback === RB.state.readback, r.readback === honest.state.readback], [false, false, true]);
}
{
  // World C (a lacking reader): the kiosk holds H0 and H2 only: it names H1 as lacking, and makes no digest
  const W = worldA(); const { w, harry, amara, foodx, H0, H1, H2 } = W;
  const m = RBk(H2, w.blocks, amara.id, 'en', '47');
  const RB = T(foodx.write('observe', m.state, { for: H2.hash, to: amara.id }), 'RB');
  const kiosk = w.blocks.filter(b => [...H0, H2.hash].includes(b.hash));
  const r = redo(RB, kiosk);
  check('world C', 'the kiosk names H1 as lacking and makes no digest', [r.same, r.readback, ids(r.lacks)], [null, null, ['H1']]);
  // and the reading itself, run on what the kiosk holds, says the same: L7 can't be told, H1 lacked
  const a = R.readback(H2, kiosk, amara.id);
  check('world C', 'the reading run on H0 and H2: L7 not_shown, lacks [H1]; the answer lacks [H1]', [a.things.map(t => t.draw), ids(a.lacks)], [[{ not_shown: true, lacks: [H1.hash] }], ['H1']]);
  check('world C', 'the kiosk\'s own text says what to fetch', en(a), `From Harry (${code(harry.id)}).\nFirst deal with this seller.\n${code(H1.hash)}: can't tell yet: 1 of Harry's blocks is missing.\nYou pay at most 300 GBP in all.`);
}
{
  // World D (a pair): Harry H2 and H2', a pair, L7 to Amara and to Leila; Amara accepted: the answer gives both draws { draw, to, yes }, never owners: []; H2 is read as a draw alone (rule 4)
  const w = new World(); const harry = Pn(w, 'harry'), amara = Pn(w, 'amara'), leila = Pn(w, 'leila');
  const flour = kindOf(harry, 'flour');
  const H1 = T(instance(harry, flour, { name: 'L7', pack: A('10', 'sacks') }), 'H1');
  const head = harry.head, seq = harry.seq;
  const H2 = T(harry.write('promise', { terms: require('../kit.cjs').linesFor(H1, { price: GBP(300) }) }, { from: harry.id, to: amara.id }), 'H2');
  const H2b = T(harry.write('promise', { terms: require('../kit.cjs').linesFor(H1, { price: GBP(300) }) }, { from: harry.id, to: leila.id }, { prev: head, seq: seq + 1 }), "H2'");
  const Y = T(amara.write('promise', { status: 'accepted' }, { answers: H2.hash, for: H2.hash }), 'Y');
  const a = R.readback(H2, w.blocks, amara.id);
  const pair = a.things[0].pair.map(p => [tg(p.draw), nm(p.to.id), p.yes]);
  const want = [['H2', 'amara', true], ["H2'", 'leila', false]].sort((x, y) => ((x[0] === 'H2' ? H2.hash : H2b.hash) < (y[0] === 'H2' ? H2.hash : H2b.hash) ? -1 : 1));
  check('world D', 'both draws, each with its receiver and whether she accepted (sorted by id)', pair, want);
  // (folds.md, A fork is a burden): a draw of the pair without its receiver's yes changes nothing on the others; where one has her yes, it is read as a draw alone: H2 holds for Amara
  check('world D', 'H2, with Amara\'s yes, is read as a draw alone: held, never an empty owner', [a.things[0].draw, 'owners' in a.things[0]], [{ state: 'held' }, false]);
  check('world D', 'Amara\'s text (line 7)', en(a), `From Harry (${code(harry.id)}).\nFirst deal with this seller.\nL7 (${code(H1.hash)}): 10 sacks, on Harry's word.\nL7: Harry signed it twice.\nL7: kept for you, in Harry's hands, on Harry's record as you hold it, until you say no.\nYou pay at most 300 GBP in all.`);
  const b = R.readback(H2b, w.blocks, leila.id);
  check('world D', 'Leila\'s text: the same line, to her', en(b), `From Harry (${code(harry.id)}).\nFirst deal with this seller.\nL7 (${code(H1.hash)}): Harry signed it twice. Neither is shown as yours.\nYou pay at most 300 GBP in all.`);
  check('world D', 'the pair\'s inputs name both draws and Amara\'s yes', [a.read.includes(H2b.hash), a.read.includes(Y.hash)], [true, true]);
}
{
  // a grant's read-back redone (a grant's worst_case): the kiosk holding only its `read` gets the same digest
  const w = new World(); const amara = Pn(w, 'amara'), ai = Pn(w, 'amara-ai', "Amara's AI"), foodx = Pn(w, 'foodx', 'FoodX'), wan = Pn(w, 'wanjiru'), harry = Pn(w, 'harry');
  const F = kindOf(amara, 'flour');
  const A1 = amara.write('promise', { terms: require('../kit.cjs').linesFor(F, { quantity: A('10', 'sack'), price: { max: { amount: GBP(21), per: A('1', 'sack') } } }) }, { to: amara.id });
  const G = amara.write('grant', { kind: 'tool', scope: { types: ['promise', 'observe', 'transfer'], on: [A1.hash], parties: [harry.id], limit: GBP(210), clocks: { names: [foodx.id, wan.id].sort(), needed: 2 } } }, { to: ai.id, meter: wan.id });
  const m = RBk(G, w.blocks, amara.id, 'en', '12');
  const RB = foodx.write('observe', m.state, { for: G.hash, to: amara.id });
  const kiosk = w.blocks.filter(b => RB.state.read.includes(b.hash) || b.hash === G.hash);
  check('a grant', 'the kiosk holding the grant\'s `read` only: the same digest', redo(RB, kiosk), { same: true, readback: RB.state.readback, lacks: [], not_run: [] });
}
{
  // a host's convention (no op checks it): the honest host seals the readback observe to Amara; she opens her copy, and redo over it gives same: true
  const W = worldA(); const { w, amara, foodx, H0, H1, H2 } = W;
  const m = RBk(H2, w.blocks, amara.id, 'en', '47');
  const RB = foodx.write('observe', { ...m.state, audience: [L.sha('commit:amara:RB')], nonce: 'abcdefabcdefabcdefabcdefabcdef12' }, { for: H2.hash, to: amara.id });
  const priv = '66'.repeat(32), pubE = fb.encPublicOf(priv, 'std');
  const env = fb.door('seal', { block: { type: RB.type, state: RB.state, refs: RB.refs }, reveals: [] }, [pubE], 'std');
  const opened = fb.door('open_copy', { header: fb.door('header', RB), header_signature: RB.signature, envelope: env }, priv);
  const mine = opened.block ? { ...opened.block, hash: opened.hash, signature: opened.signature } : opened; // open_copy gives the block, or (older) { block, hash, signature }
  const kiosk = w.blocks.filter(b => [...H0, H1.hash, H2.hash].includes(b.hash));
  check('sealed', 'the readback is sealed (an audience of one commitment); Amara opens her copy: the same block', [Array.isArray(RB.state.audience), mine.hash === RB.hash], [true, true]);
  check('sealed', 'redo over her opened copy and the blocks it read: same', redo(mine, kiosk), { same: true, readback: RB.state.readback, lacks: [], not_run: [] });
}
done();
