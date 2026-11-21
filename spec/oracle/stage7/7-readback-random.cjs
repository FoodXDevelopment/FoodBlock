// The random-world test of 07-last.md §4 (09 §7), the cheap part, on the oracle alone: for every world, block and viewer's held set.
// (The core and the oracle giving the same digest is run by test/audit/k3-lib.cjs once both engines are built: not here.)
const L = require('./7-readback-lib.cjs'); const { fb, World, T, A, kindOf, instance, check, done, Pn, GBP, R, en, enSms, RD, gsm7 } = L;
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const pick = l => l[rnd(l.length)];
const viol = { shuffle: [], unrelated: [], lacked: [], empty: [], freer: [], sms: [], words: [] };
const note = (k, s) => { if (viol[k].length < 3) viol[k].push(s); else viol[k].push(1); };
const sameAnswer = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const decision = a => RD.textOf(enSms(a), '47');
for (let wi = 0; wi < 30; wi++) {
  const w = new World(); const people = ['harry', 'amara', 'sam', 'leila', 'gita'].map(n => Pn(w, n, rnd(5) === 0 ? null : undefined));
  const seller = people[0];
  const kind = kindOf(seller, 'flour');
  // a lot with no name now and then (its code alone is said), as a seller with no signed name is (07 §4: the en-sms text still fits 160)
  const lots = [0, 1].map(i => { const pack = A(String(5 + rnd(10)), 'sacks'); return rnd(3) === 0 ? seller.write('thing', { pack }, { of: kind.hash }) : instance(seller, kind, { name: 'L' + (i + 1), pack }); });
  const words = [];
  for (let k = 0; k < 4; k++) {
    const to = pick(people.slice(1)), lot = pick(lots), r = rnd(6);
    if (r === 0) { const head = seller.head, seq = seller.seq; words.push(seller.write('promise', { terms: { price: GBP(100 + rnd(300)) } }, { from: seller.id, to: to.id, what: lot.hash })); const to2 = pick(people.slice(1)); words.push(seller.write('promise', { terms: { price: GBP(100) } }, { from: seller.id, to: to2.id, what: lot.hash }, { prev: head, seq: seq + 1 })); }
    else if (r === 1) { const t = seller.write('transfer', {}, { what: lot.hash, to_owner: to.id }); words.push(t); if (rnd(2)) to.write('transfer', { status: 'accepted' }, { answers: t.hash }); }
    else if (r === 2) { const o = seller.write('promise', { terms: { price: GBP(50 + rnd(100)) } }, { from: seller.id, to: to.id, what: lot.hash }); words.push(o); to.write('observe', { status: 'declined' }, { answers: o.hash }); }
    else if (r === 3) words.push(to.write('promise', { terms: { quantity: A('2', 'sacks'), price: GBP(60) } }, { from: seller.id, to: to.id, what: kind.hash }));
    else words.push(seller.write('promise', { terms: { price: GBP(100 + rnd(300)), quantity: { min: A('1', 'sacks'), max: A('3', 'sacks') } } }, { from: seller.id, to: to.id, what: kind.hash }));
  }
  const pairIds = new Set(fb.door('fork_pairs', w.blocks).flat());
  for (const b of words) for (const viewer of people) {
    // the viewer's held set: every block, less some she lacks (never the block itself, nor its pieces)
    const keep = new Set([b.hash, b.refs.author, ...w.blocks.filter(x => x.type === 'actor').map(x => x.hash)]);
    const held = w.blocks.filter(x => keep.has(x.hash) || rnd(4) !== 0);
    const a = R.readback(b, held, viewer.id);
    const text = en(a), dec = decision(a);
    // shuffling the held set, and adding blocks unrelated to the inputs, leaves the digest unchanged unless a pair was added
    const shuffled = [...held].sort(() => rnd(3) - 1);
    if (RD.digestOf(en(R.readback(b, shuffled, viewer.id))) !== RD.digestOf(text)) note('shuffle', b.hash.slice(0, 6));
    const w2 = new World(); const stranger = Pn(w2, 'zed'); const zk = kindOf(stranger, 'salt'); stranger.write('promise', { terms: { price: GBP(5) } }, { from: stranger.id, to: viewer.id, what: zk.hash });
    if (RD.digestOf(en(R.readback(b, [...held, ...w2.blocks], viewer.id))) !== RD.digestOf(text)) note('unrelated', b.hash.slice(0, 6));
    // adding a block she lacked changes the answer only where that block was in `lacks`, or is a pair
    const missing = w.blocks.filter(x => !held.includes(x));
    for (const x of missing) {
      const a2 = R.readback(b, [...held, x], viewer.id);
      // in `lacks` by its id, or past a block not held by its { author, key, seq } (00-shared, `lacks`)
      const lacked = a.lacks.some(e => e === x.hash || (typeof e === 'object' && e.author === x.refs.author && e.seq === x.state.seq && (e.key === null ? x.refs.key === undefined : e.key === x.refs.key)));
      if (!sameAnswer(a2, a) && !lacked && !pairIds.has(x.hash)) {
        // a block that answers or names one she now holds is read too; a change is allowed where the new block is read (it was named in her record, not lacked): it must be in the new `read`
        if (!a2.read.includes(x.hash)) { note('lacked', b.hash.slice(0, 6) + '+' + x.hash.slice(0, 6)); if (process.env.DBG) console.log('DBG', x.type, JSON.stringify(x.state), JSON.stringify(x.refs), JSON.stringify(a.things), ' => ', JSON.stringify(a2.things), JSON.stringify(a.lacks), JSON.stringify(a2.lacks)); }
      }
    }
    // no answer has an empty owner where a held signed draw names a receiver: every thing line gives a draw (a state, a why, not_shown) or is not given
    for (const l of a.things || []) if (l.draw !== null && l.draw !== 'not_drawn' && !(l.draw.state || l.draw.why || l.draw.not_shown)) note('empty', b.hash.slice(0, 6));
    // every line showing a thing kept names a freer who exists and can sign (a genesis the world holds)
    for (const l of a.things || []) if (l.draw && l.draw.state === 'held' && !(l.freer && w.blocks.some(x => x.hash === l.freer.id && x.type === 'actor'))) note('freer', b.hash.slice(0, 6));
    // every en-sms decision text is at most 160 GSM-7 characters
    if (gsm7(dec) > 160) note('sms', gsm7(dec) + ': ' + dec);
    // no rendered text holds n/d, a rule-set hash, a needed count, `names`, or "only" said of a word
    for (const t of [text, dec]) if (/\d+\/\d+/.test(t) || /[0-9a-f]{64}/.test(t) || /\bneeded\b|\bnames:/.test(t) || /word only|only (her|his|your) word/i.test(t)) note('words', t);
  }
}
const show = k => [viol[k].length, viol[k].filter(x => x !== 1)];
check('§4 random', 'shuffling the held set leaves the digest unchanged', show('shuffle'), [0, []]);
check('§4 random', 'adding blocks unrelated to the inputs leaves the digest unchanged', show('unrelated'), [0, []]);
check('§4 random', 'adding a block she lacked changes the answer only where it was lacked, is a pair, or is now read', show('lacked'), [0, []]);
check('§4 random', 'no empty owner where a held signed draw names a receiver', show('empty'), [0, []]);
check('§4 random', 'every line showing a thing kept names a freer who exists and can sign', show('freer'), [0, []]);
check('§4 random', 'every en-sms decision text is at most 160 GSM-7 characters', show('sms'), [0, []]);
check('§4 random', 'no text holds n/d, a rule-set hash, a needed count, `names`, or "word only"', show('words'), [0, []]);
done();
