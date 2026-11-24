// Keeping apart (a key for one counterparty, a wrapped copy), the admission rule of a node, a receipt to a pusher, a seller backing his title, the later buyer.
const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, codes, sha, mkKey, day } = L;
const hdrMsg = b => ({ header: fb.door('header', b), header_signature: b.signature });
const enc = seedByte => { const priv = seedByte.repeat(32); return { priv, pub: fb.encPublicOf(priv, 'std') }; };
// ---------------------------------------------------------------- Keeping apart, the World: K1 adds key C under Amara's sealing voice; C signs A2; Harry's host holds K1 as a header only
{
  const w = new World(), amara = P(w, 'amara'), harry = P(w, 'harry');
  const ck = mkKey('amara-key-for-harry');
  const K1 = T(amara.write('grant', { kind: 'key', voices: [{ key: amara.key.pub }, { key: ck.pub, wait: 'PT0S' }], audience: [sha('harry:K1'), sha('amara:K1')].sort(), nonce: 'abcdefabcdefabcdefabcdefabcdef01' }, { subject: amara.id, updates: amara.id }), 'K1');
  const c1 = amara.write('observe', { kind: 'confirm', audience: [sha('harry:c1'), sha('amara:c1')].sort(), nonce: 'abcdefabcdefabcdefabcdefabcdef02' }, { confirms: K1.hash });
  const C = amara.asKey(ck, K1.hash, K1.hash);
  const flour = kindOf(harry, 'flour');
  const A2 = T(C.write('promise', { terms: require('../kit.cjs').linesFor(flour, { quantity: A('10', 'sack'), price: { value: '300', unit: 'GBP' } }), audience: [sha('harry:A2'), sha('amara:A2')].sort(), nonce: 'abcdefabcdefabcdefabcdefabcdef03', channel: 'x'.repeat(900) }, { from: harry.id, to: amara.id, after: [c1.hash] }), 'A2');
  // Harry holds everything: valid(A2) is []; its key is C's
  check('Keeping', 'Harry holds K1: valid(A2) is [] and the key that signed is C\'s (the key grant K1 brought C in)', [fb.door('valid', A2, w.blocks), fb.door('signed_by_author', A2, w.blocks)], [[], true]);
  // his host holds K1 only as its header
  const host = w.blocks.filter(b => b !== K1 && b !== c1 && b !== A2).concat([hdrMsg(K1), hdrMsg(c1)]);
  const v = fb.door('valid', hdrMsg(A2), host);
  check('Keeping', 'a host holding K1 only as its header: A2\'s header is `unmet`, naming K1, never bad_signature', v.map(x => x.code === 'unmet' ? ['unmet', (x.needs || x.detail || '') .toString().includes(K1.hash) || JSON.stringify(x).includes(K1.hash)] : [x.code]), [['unmet', true]]);
  // the wrapped copy (Amara wraps A2's sealed copy to Harry's mailbox key X)
  const hk = enc('77'), X = enc('88');
  const env = fb.door('seal', { block: { type: A2.type, state: A2.state, refs: A2.refs }, reveals: [] }, [hk.pub], 'std', { pad: true });
  const copy = { header: fb.door('header', A2), header_signature: A2.signature, envelope: env };
  const wrapped = fb.wrapCopy(copy, X.pub, 'std');
  const open = fb.unwrapCopy(wrapped, X.priv);
  check('Keeping', 'Harry\'s open_copy of the inner copy gives A2', fb.door('open_copy', open, hk.priv).hash, A2.hash);
  const bytes = Buffer.from(wrapped.envelope.ciphertext, 'base64').length;
  check('Keeping', 'a host keeps a wrapped copy as { mailbox: X, bytes }; bytes after padding are a pad size plus the 16-byte tag (4112 in the text\'s world: 4096 + 16)', [fb.padSize(bytes - 16) === bytes - 16, (bytes - 16) % 512 === 0], [true, true]);
  check('Keeping', 'the world\'s size: 4112 (the inner copy of A2 pads past 2048 to 4096)', bytes, 4112);
  // Admission, in the core's shape: the third argument's `copies` is the node's rule, the fifth names the push. A node whose rule names the mailbox X keeps the wrapped copy; one that
  // states only signed pushes keeps it nowhere
  const held = w.blocks.filter(b => b !== A2);
  const r1 = fb.door('accept', [wrapped], held, { takes_pairs: false, copies: { mailboxes: [X.pub] } }, null, {});
  const r2 = fb.door('accept', [wrapped], held, { takes_pairs: false, copies: { signed: true } }, null, {});
  check('admission of a node', 'unsigned push of the wrapped copy, a node whose rule names the mailbox: kept, as { mailbox, bytes }', [r1.wrapped, r1.taken, r1.refused, r1.copies], [[{ mailbox: X.pub, bytes }], [], [], []]);
  check('admission of a node', 'the same push, a node whose rule states only signed pushes: kept nowhere, taken []', [r2.wrapped, r2.taken, r2.refused], [[], [], []]);
  // a sealed copy for a reader: kept from a signed push by its author under `signed`; handed on by Leila only under `handed_on`, never in the author's place; an unsigned push keeps none under `signed`
  const leila = P(w, 'leila');
  const forW = { [A2.hash]: [harry.id] }, signed = { takes_pairs: false, copies: { signed: true } };
  const s1 = fb.door('accept', [copy], held, signed, null, { signer: amara.id, for: forW });
  const s2 = fb.door('accept', [copy], held, signed, null, { for: forW });
  const s3 = fb.door('accept', [copy], held, signed, null, { signer: leila.id, for: forW });
  const s4 = fb.door('accept', [copy], held, { takes_pairs: false, copies: { handed_on: true } }, null, { signer: leila.id, for: forW });
  const s5 = fb.door('accept', [copy], held, { takes_pairs: false, copies: { unsigned: true } }, null, { for: forW });
  check('admission of a node', 'a sealed copy for a named reader: kept from a signed push by its author (rule: signed), never from an unsigned one', [s1.copies, s2.copies], [[{ hash: A2.hash, for: [harry.id], from: 'author' }], []]);
  check('admission of a node', 'handed on by Leila: kept only under handed_on, as handed_on; an unsigned push only under unsigned, as handed_on', [s3.copies, s4.copies, s5.copies], [[], [{ hash: A2.hash, for: [harry.id], from: 'handed_on' }], [{ hash: A2.hash, for: [harry.id], from: 'handed_on' }]]);
  check('admission of a node', 'a rule that states nothing keeps no copy', fb.door('accept', [copy], held, { takes_pairs: false, copies: {} }, null, { signer: amara.id, for: forW }).copies, []);
  check('admission of a node', 'with neither a rule nor a push, accept answers as before (no copies, no wrapped)', Object.keys(fb.door('accept', [copy], held, { takes_pairs: false })).sort(), ['equivocations', 'false_headers', 'refused', 'taken', 'unjudged', 'unread']);
}
// ---------------------------------------------------------------- A receipt sealed to a pusher names only what that pusher's push added
{
  const w = new World(), sam = P(w, 'sam'), leila = P(w, 'leila'), wan = P(w, 'wanjiru');
  const bs = sam.write('observe', { kind: 'note', text: 'from sam' }), bl = leila.write('observe', { kind: 'note', text: 'from leila' });
  const rs = fb.receiptFor([bs.hash]), rl = fb.receiptFor([bl.hash]);
  check('receipt to a pusher', 'Sam and Leila push one block each in one second: the receipt to Sam names Sam\'s block only', [rs.refs.derives_from, rl.refs.derives_from], [[bs.hash], [bl.hash]]);
  // the door: push_answer refuses (shape) a receipt that names a block not in that answer's taken
  const nk = fb.door('keypair', '9'.repeat(64));
  const parts = receipt => ({ taken: [bs.hash], unjudged: [], refused: [], unread: [], equivocations: [], receipt });
  let err = null; try { fb.door('push_answer', parts(fb.receiptFor([bs.hash, bl.hash])), wan.id, nk.private_key); } catch (e) { err = e.code; }
  check('receipt to a pusher', 'push_answer to Sam with a receipt naming Leila\'s block too: refused (shape)', err, 'shape');
  check('receipt to a pusher', 'push_answer to Sam with a receipt naming Sam\'s block alone: signed, taken [Sam\'s]', fb.door('push_answer', parts(rs), wan.id, nk.private_key).taken, [bs.hash]);
}
// ---------------------------------------------------------------- A seller backing his own title; the later buyer
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), sam = P(w, 'sam'), gita = P(w, 'gita');
  const sk = mkKey('harry-sealing');
  const K1 = T(harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: sk.pub, wait: 'PT0S' }] }, { subject: harry.id, updates: harry.id }), 'K1');
  const c1 = harry.write('observe', { kind: 'confirm' }, { confirms: K1.hash });
  const S = harry.asKey(sk, K1.hash, K1.hash);
  const K = kindOf(S, 'sack'), Q = T(instance(S, K, { pack: A('1', 'sack') }, { after: [c1.hash] }), 'Q'), R = T(instance(S, K, { pack: A('1', 'sack') }), 'R');
  const dR = deal(S, R, amara, A('1', 'sack'));
  const H2 = T(S.write('transfer', { amount: A('1', 'sack'), audience: [sha('amara:H2')], nonce: 'abcdefabcdefabcdefabcdefabcdef09' }, { what: R.hash, to_owner: amara.id, for: dR.o.hash, after: [dR.a.hash] }), 'H2');
  const H3 = T(S.write('promise', { terms: require('../kit.cjs').linesFor(Q, { quantity: A('1', 'sack'), price: { value: '30', unit: 'GBP' }, backing: { value: '300', unit: 'GBP' } }) }, { from: harry.id, to: sam.id }), 'H3');
  const S1 = T(sam.write('promise', { status: 'accepted' }, { answers: H3.hash, for: H3.hash }), 'S1');
  const store = w.blocks.filter(b => b !== H2).concat([hdrMsg(H2)]);
  check('Backing', 'Sam holds H2 only as its header: ownership(Q) is not shown, lacking H2 (the line of S holds a sealed block)', ownersOf(fb.door('ownership', Q, store)), { not_shown: true, lacks: ['H2'] });
  check('Backing', 'read(H3) is [] : the backing term is read (a term of the promise)', codes(fb.door('read', H3, store)), []);
  check('Backing', 'the buyer reads the backing beside not_shown: terms.backing £300 in H3', H3.state.terms.backing, { value: '300', unit: 'GBP' });
}
done();
