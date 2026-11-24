// Who learns what (privacy.md and nodes.md). Each question prints the oracle's answer and the answer the text gives, and OK or DIFF.
const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, codes, sha, mkKey, day } = L;
const sealedTo = (who, tag) => [sha('commit:' + who + ':' + tag)];
const hdrMsg = b => ({ header: fb.door('header', b), header_signature: b.signature });
// ---------------------------------------------------------------- What stays public (World): a stranger's unsigned pull never gets a sealed header; a line holding a sealed block is not shown whole
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), sam = P(w, 'sam');
  const sk = mkKey('harry-sealing');
  const voices = [{ key: harry.key.pub }, { key: sk.pub, wait: 'PT0S' }];
  const K1 = T(harry.write('grant', { kind: 'key', voices }, { subject: harry.id, updates: harry.id }), 'K1');
  const c1 = harry.write('observe', { kind: 'confirm' }, { confirms: K1.hash });
  const S = harry.asKey(sk, K1.hash, K1.hash);
  // the sealing key S makes sack Q and later sells it sealed (a key that writes both: the line then shows less to a stranger); Harry's main key makes sack R
  const K = kindOf(harry, 'sack'), Q = T(instance(S, K, { pack: A('1', 'sack') }), 'Q'), R = T(instance(harry, K, { pack: A('1', 'sack') }), 'R');
  const A1 = T(amara.write('promise', { terms: require('../kit.cjs').linesFor(Q, { quantity: A('1', 'sack'), price: { value: '1', unit: 'GBP' } }) }, { from: amara.id, to: harry.id }), 'A1');
  const H2 = T(S.write('transfer', { amount: A('1', 'sack'), audience: sealedTo('amara', 'H2'), nonce: 'abcdefabcdefabcdefabcdefabcdef12' }, { what: Q.hash, to_owner: amara.id, for: A1.hash }), 'H2');
  const dR = deal(harry, R, sam, A('1', 'sack'));
  const H3 = T(sell(harry, R, sam, dR, A('1', 'sack')), 'H3');
  const log = w.blocks.map((b, i) => ({ n: i + 1, block: b }));
  const pull = fb.door('answer_pull', log, { since: 0 }, harry.id, null, { cap: 500, serves_pairs: true }, null, w.blocks, 'std', null);
  const got = pull.blocks.map(x => x.message.block ? tg(x.message.block ? (w.blocks.find(b => fb.hashOfBlock({ type: x.message.block.type, state: x.message.block.state, refs: x.message.block.refs }, 'std') === (w.blocks.find(y => y.signature === x.message.signature) || {}).hash) || {}).hash || '' : '') : 'header').length;
  const shown = pull.blocks.map(x => x.message);
  check('public pull', 'a stranger\'s unsigned pull: no message of it is a header, and none is H2 (public blocks only)', [shown.some(m => m.header !== undefined), shown.some(m => m.signature === H2.signature), shown.length], [false, false, w.blocks.length - 1]);
  // the signed pull of Amara, who holds a copy of H2 for her, also gets that copy
  const withCopy = log.map(e => e.block === H2 ? { ...e, copies: { [amara.id]: { ...hdrMsg(H2), envelope: { alg: 'x' } } } } : e);
  const pull2 = fb.door('answer_pull', withCopy, { since: 0 }, harry.id, null, { cap: 500, serves_pairs: true }, amara.id, w.blocks, 'std', null);
  check('public pull', 'a pull signed by Amara, for whom a copy is kept, gets it too', pull2.blocks.length, w.blocks.length);
  // Sam holds H2 only as its header
  const store = w.blocks.filter(b => b !== H2).concat([hdrMsg(H2)]);
  check('public pull', 'Sam holding H2 only as its header: ownership(Q) is not shown, lacking H2', ownersOf(fb.door('ownership', Q, store)), { not_shown: true, lacks: ['H2'] });
  check('public pull', 'ownership(R) is Sam\'s', ownersOf(fb.door('ownership', R, store)), { owners: [['sam', '1']] });
  // the header carries no `withheld` (A5)
  check('the header', 'the header is author, seq, prev, hash (and key, skip): no withheld', Object.keys(fb.door('header', H2)).sort(), ['author', 'hash', 'key', 'prev', 'seq']);
  const wb = harry.make('promise', { terms: require('../kit.cjs').linesFor(Q, { quantity: A('1', 'sack') }), withheld: true }, { from: harry.id, to: amara.id }, { keep: true });
  check('the header', 'a promise that says state.withheld is refused: it is no field (undeclared_field)', codes(fb.door('write_refusals', { type: wb.type, state: wb.state, refs: wb.refs }, w.blocks)), ['undeclared_field']);
}
// ---------------------------------------------------------------- Not given: deniability. A signature is a fact about bytes; wiping a key ends what it can sign next, never what it signed
{
  const w = new World(), amara = P(w, 'amara'), harry = P(w, 'harry'), gita = P(w, 'gita');
  const pk = mkKey('amara-phone');
  const voices2 = [{ key: amara.key.pub }, { key: pk.pub, wait: 'PT0S' }];
  const A0 = w.blocks[0];
  const K1 = T(amara.write('grant', { kind: 'key', voices: voices2 }, { subject: amara.id, updates: amara.id }), 'K1');
  const c1 = amara.write('observe', { kind: 'confirm' }, { confirms: K1.hash });
  const phone = amara.asKey(pk, K1.hash, K1.hash);
  const K = kindOf(harry, 'flour');
  const H1 = T(harry.write('promise', { terms: require('../kit.cjs').linesFor(K, { quantity: A('10', 'sack'), price: { value: '30', unit: 'GBP' } }) }, { from: harry.id, to: amara.id }), 'H1');
  const a1 = T(phone.write('promise', { status: 'accepted', audience: sealedTo('harry', 'A1'), nonce: 'abcdefabcdefabcdefabcdefabcdef12' }, { answers: H1.hash, for: H1.hash, after: [c1.hash] }), 'A1');
  // K2 ends the phone's key, counted up to A1
  const K2 = T(amara.write('grant', { kind: 'key', voices: [{ key: amara.key.pub }], counted_to: a1.hash }, { subject: amara.id, updates: K1.hash }), 'K2');
  const held = w.blocks;
  check('Not given', 'at Gita: the key that signed A1 is the phone\'s, and A1 stands; a key wiped signs nothing next, but what it signed stands', [fb.door('signed_by_author', a1, held), fb.door('stands', a1, held).stands], [true, true]);
  // a block the phone signs after K2 counts for no block that has K2 in its past
  const late = phone.make('promise', { terms: require('../kit.cjs').linesFor(K, { quantity: A('1', 'sack') }) }, { from: amara.id, to: harry.id, after: [K2.hash] });
  check('Not given', 'a block P signs after K2 counts nothing for a block with K2 in its past', fb.door('signed_by_author', late, [...held, late]), false);
}
// ---------------------------------------------------------------- Showing a deal: a side shows the other's signature; a refrain changes nothing a shown block proves
{
  const w = new World(), amara = P(w, 'amara'), harry = P(w, 'harry'), leila = P(w, 'leila'), gita = P(w, 'gita');
  const K = kindOf(harry, 'flour');
  const A1 = T(amara.write('promise', { terms: require('../kit.cjs').linesFor(K, { quantity: A('10', 'sack'), price: { value: '30', unit: 'GBP' } }), audience: sealedTo('both', 'A1'), nonce: 'abcdefabcdefabcdefabcdefabcdef12' }, { from: harry.id, to: amara.id }), 'A1');
  const H2 = T(harry.write('promise', { status: 'accepted', audience: sealedTo('both', 'H2'), nonce: 'abcdefabcdefabcdefabcdefabcdef34' }, { answers: A1.hash, for: A1.hash }), 'H2');
  const held = w.blocks;
  check('Showing', 'shown to Leila: valid(H2) is [] and the signature is Harry\'s', [fb.door('valid', H2, held), fb.door('signed_by_author', H2, held)], [[], true]);
  const R1 = T(amara.write('promise', { terms: require('../kit.cjs').linesFor(K, { quantity: A('1', 'sack'), price: { value: '0', unit: 'GBP' } }), audience: sealedTo('both', 'R1'), nonce: 'abcdefabcdefabcdefabcdefabcdef56' }, { from: amara.id, to: harry.id }), 'R1');
  const H2b = T(harry.write('promise', { status: 'accepted', audience: sealedTo('both', 'H2b'), nonce: 'abcdefabcdefabcdefabcdefabcdef78' }, { answers: A1.hash, for: A1.hash, after: [R1.hash] }), 'H2b');
  check('Showing', 'with a refrain R1 in H2\'s past: valid is the same; R1 is read as Amara\'s promise', [fb.door('valid', H2b, w.blocks), fb.door('signed_by_author', H2b, w.blocks), codes(fb.door('read', R1, w.blocks))], [[], true, []]);
}
// ---------------------------------------------------------------- Sealed messages: padding sizes (512, 1024, 2048, 4096, then each 4096)
{
  const w = new World(), amara = P(w, 'amara'), maria = P(w, 'maria');
  const a1 = amara.write('promise', { terms: require('../kit.cjs').linesFor(null, { quantity: A('1', 'loaf') }), text: 'x'.repeat(380) }, { from: amara.id, to: maria.id });
  const block = { type: a1.type, state: a1.state, refs: a1.refs };
  const priv = '55'.repeat(32), pubE = fb.encPublicOf(priv, 'std');
  const bytesOf = plain => { const env = fb.door('seal', plain, [pubE], 'std', { pad: true }); return Buffer.from(env.ciphertext, 'base64').length - 16; };
  const open = plain => { const env = fb.door('seal', plain, [pubE], 'std', { pad: true }); return fb.door('open_copy', { header: fb.door('header', a1), header_signature: a1.signature, envelope: env }, priv).hash; };
  const unpadded = JSON.stringify({ block, reveals: [] }).length;
  check('Sealed', 'the unpadded plaintext is under 1024 bytes and over 512', [unpadded > 512, unpadded < 1024], [true, true]);
  check('Sealed', 'padded: the plaintext is 1024 bytes; open_copy gives A1, the same id as unpadded', [bytesOf({ block, reveals: [] }), open({ block, reveals: [] }) === a1.hash], [1024, true]);
  const big = { ...block, state: { ...block.state, text: 'x'.repeat(5000) } };
  check('Sealed', 'a plaintext over 4096 pads to the next multiple of 4096 (5,000+ bytes: 8192)', bytesOf({ block: big, reveals: [] }), 8192);
  check('Sealed', 'the sizes: 100 -> 512, 513 -> 1024, 2049 -> 4096, 4097 -> 8192, 8193 -> 12288', [100, 513, 2049, 4097, 8193].map(fb.padSize), [512, 1024, 4096, 8192, 12288]);
}
done();
