'use strict';
// node stories.cjs : prints each question asked of the oracle and its answer, for stage 2 (the store). ANSWERS.md records them with the sentence of the spec that gives each.
const { fb, cj, sha, mkKey, signRaw, day, World, person, Signer, headerOf, message, wire, headerMessage, crypto } = require('./lib.cjs');
const Q = (story, q, a) => console.log(`${story} | ${q} => ${a}`);
const J = x => JSON.stringify(x);
const codes = r => J(r.map(x => x.code));
const valid = (b, held) => codes(fb.door('valid', b, held));
const short = h => (typeof h === 'string' ? h.slice(0, 6) : J(h));

// ---------------------------------------------------------------- 1. a block with a field an older reader cannot read
{
  const S = '1 not read', w = new World(), maria = person(w, 'maria');
  const b1 = maria.write('thing', { name: 'before' });
  const b41 = maria.write('promise', { what: 'bread', sparkle: 'a field from a newer version' });
  const b42 = maria.write('thing', { name: 'after' });
  const b43 = maria.write('thing', { name: 'names the sparkle' }, { for: b41.hash });
  const held = w.blocks.filter(b => b !== b41 && b !== b42 && b !== b43);
  Q(S, 'valid(41) block with state.sparkle', valid(b41, held));
  Q(S, 'read(41)', codes(fb.door('read', b41, held)));
  Q(S, 'valid(42), only 41 held beyond her genesis and 1', valid(b42, [...held, b41]));
  Q(S, 'read(42)', codes(fb.door('read', b42, [...held, b41])));
  Q(S, 'valid(43), the thing that names 41 in refs.for', valid(b43, [...held, b41, b42]));
  Q(S, 'read(43): names_unread, with the id', J(fb.door('read', b43, [...held, b41, b42]).map(x => [x.code, (x.ids || []).map(short)])));
  const r = fb.door('accept', [b41, b42, b43], held, { takes_pairs: false });
  Q(S, 'accept(41, 42, 43): taken / unread', `${J(r.taken.map(short))} / ${J(r.unread.map(u => [short(u.hash), u.codes]))}`);
  const pool = new fb.Pool(w.blocks);
  Q(S, 'what a fold reads of 41: its header, no type', `${pool.get(b41.hash).type} ${pool.get(b41.hash).state.audience}`);
  Q(S, 'what a fold reads of 42: the block', String(pool.get(b42.hash).type));
  Q(S, 'signed_by_author(42)', String(fb.door('signed_by_author', b42, w.blocks)));
  Q(S, 'read(41) once the reader knows the field: a schema declaring sparkle, named in refs.schema', '(see story 1b)');
  const schema = { type: 'thing', state: { kind: 'schema', at: day(0), audience: 'public', seq: 1, fields: { sparkle: 'text' } }, refs: { author: maria.id, prev: maria.id } };
  const sh = sha(cj(schema)), sw = new World(); sw.blocks = [...w.blocks.slice(0, 1)];
  const sig = signRaw(maria.key, cj(headerOf(schema, sh)));
  const sFull = { hash: sh, ...schema, signature: sig };
  const m2 = new Signer(sw, maria.id, maria.key, undefined, sh); m2.seq = 1;
  const b41b = m2.make('promise', { what: 'bread', sparkle: 'newer' }, { schema: sh });
  Q('1b not read, then read', 'read(41 naming a schema it declares), schema not held', J(fb.door('read', b41b, [...sw.blocks, sFull].filter(x => x !== sFull)).map(x => x.code)));
  Q('1b not read, then read', 'read(41 naming the schema), the schema held', J(fb.door('read', b41b, [...sw.blocks, sFull]).map(x => x.code)));
}

// ---------------------------------------------------------------- 2. a lost block on a key's line
{
  const S = '2 lost block', w = new World(), maria = person(w, 'maria');
  const b1 = maria.write('thing', { name: 'one' }), b2 = maria.write('thing', { name: 'two' });
  const b3 = maria.write('thing', { name: 'three' }, {}, { keep: true });
  const b4 = maria.write('thing', { name: 'four' });
  Q(S, 'valid(4) with 3 not held', valid(b4, w.blocks));
  Q(S, 'check_chain: gaps / broken', (c => `${J(c.gaps)} / ${c.broken.length}`)(fb.door('check_chain', w.blocks.slice(1), maria.id)));
  Q(S, 'read_whole(4, 1): whole, lacks (3 named by 4\'s prev)', (r => `${r.whole} ${J(r.lacks.map(x => (typeof x === 'string' ? x === b3.hash : x)))}`)(fb.door('read_whole', b4.hash, b1.hash, w.blocks)));
  Q(S, 'a fold that reads the line (onLine) answers', J(fb.onLine(b4.hash, b1.hash, w.blocks, () => 'an answer')).replace(b3.hash, '<3>'));
  w.add(b3);
  Q(S, 'read_whole(4, 1) with 3 held', J(fb.door('read_whole', b4.hash, b1.hash, w.blocks)));
  Q(S, 'the fold now answers', J(fb.onLine(b4.hash, b1.hash, w.blocks, () => 'an answer')));
  // a block of seq 4 whose prev is block 2: seq says 3 is missing, prev does not name it
  const w2 = new World(); w2.blocks = w.blocks.slice(0, 3);
  const m2 = new Signer(w2, maria.id, maria.key, undefined, b2.hash); m2.seq = 2;
  const c4 = m2.write('thing', { name: 'four, after two' }, {}, { seq: 4 });
  Q(S, 'read_whole(c4 seq 4 prev block 2, 1): lacks by number', J(fb.door('read_whole', c4.hash, b1.hash, w2.blocks)).replace(maria.id, '<maria>'));
  // a header in place of block 3
  const w3 = new World(); w3.blocks = [...w.blocks.filter(b => b !== b3)];
  const hm = headerMessage(b3);
  Q(S, 'read_whole(4, 1) with 3 held as its header only', (r => `${r.whole} ${J(r.lacks.map(x => (x === b3.hash ? '<3>' : x)))}`)(fb.door('read_whole', b4.hash, b1.hash, [...w3.blocks, hm])));
  // not shown: a start that is not on the line
  try { fb.door('read_whole', b4.hash, maria.id + '', w.blocks); Q(S, 'read_whole with the genesis as start', 'no error'); } catch (e) { Q(S, 'read_whole with a start not on the line', 'argument error'); }
}

// ---------------------------------------------------------------- 3. a block before its key grant
{
  const S = '3 key grant', w = new World(), maria = person(w, 'maria'), tablet = mkKey('maria-tablet');
  const KG = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tablet.pub }] }, { subject: maria.id, updates: maria.id });
  const t = maria.asKey(tablet, KG.hash);
  const first = t.write('thing', { name: 'from the tablet' }, {}, { keep: true });
  Q(S, 'valid(tablet\'s first block), key grant not held', J(fb.door('valid', first, [w.blocks[0]]).map(x => [x.code, x.detail.replace(KG.hash, '<KG>')])));
  Q(S, 'valid(tablet\'s first block), key grant held', valid(first, w.blocks));
  Q(S, 'accept(tablet block) with no key grant: unjudged needs the key grant', J((r => ({ taken: r.taken.length, unjudged: r.unjudged.map(u => u.needs.map(n => n === KG.hash ? '<KG>' : n)) }))(fb.door('accept', [first], [w.blocks[0]], { takes_pairs: false }))));
  Q(S, 'accept(key grant, then the tablet block, in one push)', J((r => ({ taken: r.taken.length, unjudged: r.unjudged.length }))(fb.door('accept', [first, KG], [w.blocks[0]], { takes_pairs: false }))));
  // a forged key grant: signed by the key it brings in, naming no refs.key
  const forged = { type: 'grant', state: { kind: 'key', at: day(0), audience: 'public', seq: 1, voices: [{ key: maria.key.pub }, { key: tablet.pub }] }, refs: { author: maria.id, prev: maria.id, subject: maria.id, updates: maria.id } };
  const fh = sha(cj(forged)), fFull = { hash: fh, ...forged, signature: signRaw(tablet, cj(headerOf(forged, fh))) };
  Q(S, 'valid(a key grant signed by the key it brings in, no refs.key)', valid(fFull, [w.blocks[0]]));
  const tf = new Signer(new World(), maria.id, tablet, fh, fh);
  const viaForged = tf.make('thing', { name: 'via the forged grant' });
  Q(S, 'valid(a block naming the forged key grant)', valid(viaForged, [w.blocks[0], fFull]));
  // refs.key naming a block that is no key grant of the author
  const other = person(w, 'other');
  const wrongKG = new Signer(w, maria.id, tablet, other.id, other.id).make('thing', { name: 'names another identity as its key grant' });
  Q(S, 'valid(refs.key names a genesis, not a key grant)', valid(wrongKG, w.blocks));
  // a key grant about another author
  const kgOther = other.write('grant', { kind: 'key', voices: [{ key: other.key.pub }, { key: tablet.pub }] }, { subject: other.id, updates: other.id });
  const aboutOther = new Signer(w, maria.id, tablet, kgOther.hash, kgOther.hash).make('thing', { name: 'names a key grant of someone else' });
  Q(S, 'valid(refs.key names a key grant whose subject is another author)', valid(aboutOther, w.blocks));
  // a key grant that Sam's reader cannot read still brings its key in
  const KG2 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tablet.pub }], sparkle: 'newer' }, { subject: maria.id, updates: maria.id });
  const t2 = maria.asKey(tablet, KG2.hash), viaNR = t2.write('thing', { name: 'via a key grant this reader cannot read' });
  Q(S, 'valid(block of a key brought in by a not-read key grant)', valid(viaNR, w.blocks));
  Q(S, 'read(that key grant): undeclared_field', codes(fb.door('read', KG2, w.blocks)));
  Q(S, 'signed_by_author(block of a key a not-read key grant brings in)', String(fb.door('signed_by_author', viaNR, w.blocks)));
}

// ---------------------------------------------------------------- 4. a suite the reader does not know
{
  const S = '4 unknown suite', w = new World(), maria = person(w, 'maria');
  const KG = maria.write('grant', { kind: 'key', suite: 'pq1', voices: [{ key: maria.key.pub }] }, { subject: maria.id, updates: maria.id });
  Q(S, 'valid(a key grant naming suite pq1)', valid(KG, w.blocks));
  const kgBlock = (extra) => ({ type: 'grant', state: { kind: 'key', at: day(0), audience: 'public', seq: 1, public_key_sign: 'aa'.repeat(40), ...extra }, refs: { author: maria.id, prev: maria.id, subject: maria.id } });
  const g2 = kgBlock({}), g2h = sha(cj(g2));
  Q(S, 'valid(a key grant adding a key that fits no suite)', valid({ hash: g2h, ...g2, signature: signRaw(maria.key, cj(headerOf(g2, g2h))) }, w.blocks));
  const pqKey = new Signer(new World(), maria.id, mkKey('pq-holder'), KG.hash, KG.hash);
  const viaPq = pqKey.make('thing', { name: 'a block of the key of an unknown suite' });
  Q(S, 'valid(a block whose key grant names a suite not known)', valid(viaPq, [...w.blocks]));
  const r = fb.door('accept', [KG, viaPq], [w.blocks[0]], { takes_pairs: false });
  Q(S, 'accept(both): taken / unjudged / refused', `${r.taken.length} / ${r.unjudged.length} / ${r.refused.length}`);
}

// ---------------------------------------------------------------- 5. a held header that is not the signed header
{
  const S = '5 held header', w = new World(), maria = person(w, 'maria'), tablet = mkKey('maria-tablet');
  const KG = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tablet.pub }] }, { subject: maria.id, updates: maria.id });
  const t = maria.asKey(tablet, KG.hash);
  const b = t.write('thing', { name: 'sealed one' });
  const hm = headerMessage(b);
  Q(S, 'valid({ header, header_signature }) with its pieces held', valid(hm, w.blocks));
  Q(S, 'the header carries key', String(hm.header.key === KG.hash));
  Q(S, 'valid(the header with key left out)', valid({ header: { ...hm.header, key: undefined }, header_signature: hm.header_signature }, w.blocks));
  Q(S, 'valid(the header with key changed to the genesis id)', valid({ header: { ...hm.header, key: maria.id }, header_signature: hm.header_signature }, w.blocks));
  Q(S, 'valid(the header with seq 2)', valid({ header: { ...hm.header, seq: 2 }, header_signature: hm.header_signature }, w.blocks));
  Q(S, 'valid(the header with another prev)', valid({ header: { ...hm.header, prev: maria.id }, header_signature: hm.header_signature }, w.blocks));
  Q(S, 'valid(the header with an extra key)', valid({ header: { ...hm.header, at: day(1) }, header_signature: hm.header_signature }, w.blocks));
  Q(S, 'valid(the header, key grant not held)', J(fb.door('valid', hm, [w.blocks[0]]).map(x => x.code)));
  Q(S, 'valid(the header: a bare unsigned header)', J(fb.door('valid', { header: hm.header }, w.blocks).map(x => x.code)));
  // the same block whole: its signature opens over the header, not over the body
  const bodyBytes = cj({ type: b.type, state: b.state, refs: b.refs });
  Q(S, 'valid(the block signed over its own bytes: the body form)', valid({ ...b, signature: signRaw(tablet, bodyBytes) }, w.blocks));
  Q(S, 'verify(block, signature, key) over the header', String(fb.door('verify', b, b.signature, tablet.pub)));
  Q(S, 'verify(block, body-form signature, key)', String(fb.door('verify', b, signRaw(tablet, bodyBytes), tablet.pub)));
  Q(S, 'a header held beside its body is nothing new: accept(header) taken', J(fb.door('accept', [hm], w.blocks.concat([b]), { takes_pairs: false }).taken.map(short)));
  Q(S, 'a header that does not describe the body held', J(fb.door('accept', [{ header: { ...hm.header, seq: 9 }, header_signature: hm.header_signature }], w.blocks.concat([b]), { takes_pairs: false }).refused.map(x => x.code)));
  // a body beats a false header
  const fake = { header: { ...hm.header, prev: maria.id }, header_signature: hm.header_signature };
  const r = fb.door('accept', [b], [...w.blocks.slice(0, 2), fake], { takes_pairs: false });
  Q(S, 'a body arrives for a header held under its hash that names another prev: taken / false_headers', `${r.taken.length} / ${J(r.false_headers.map(short))}`);
}

// ---------------------------------------------------------------- 6. pairs by prev or by seq
{
  const S = '6 pairs', w = new World(), maria = person(w, 'maria');
  const b1 = maria.write('thing', { name: 'one' });
  const b2a = maria.write('thing', { name: 'two a' });
  maria.head = b1.hash; maria.seq = 1;
  const b2b = maria.write('thing', { name: 'two b' });
  Q(S, 'fork_pairs: two blocks of one key on one prev', J(fb.door('fork_pairs', w.blocks).map(p => p.map(short))) + ' ' + (J([b2a.hash, b2b.hash].sort().map(short))));
  Q(S, 'check_chain equivocations', J(fb.door('check_chain', w.blocks.slice(1), maria.id).equivocations.length));
  const w2 = new World(); w2.blocks = w.blocks.slice(0, 2);
  const m2 = new Signer(w2, maria.id, maria.key, undefined, b1.hash); m2.seq = 1;
  const c2 = m2.write('thing', { name: 'two' });
  const m3 = new Signer(w2, maria.id, maria.key, undefined, sha('a made-up block'), 0); m3.seq = 1;
  const c2b = m3.write('thing', { name: 'two, on a made-up prev' });
  Q(S, 'fork_pairs: two blocks at one seq, one naming a made-up prev', J(fb.door('fork_pairs', w2.blocks).map(p => p.map(short))) + ' ' + J([c2.hash, c2b.hash].sort().map(short)));
  const r = fb.door('accept', [c2b], [...w2.blocks.slice(0, 2), c2], { takes_pairs: false });
  Q(S, 'accept(c2b) when c2 is held, takes_pairs false: taken / equivocations / refused / unjudged', `${r.taken.length} / ${r.equivocations.length} / ${r.refused.length} / ${r.unjudged.length}`);
  const r2 = fb.door('accept', [c2b], [...w2.blocks.slice(0, 2), c2], { takes_pairs: true });
  Q(S, 'the same with takes_pairs true: taken', String(r2.taken.length));
  const r3 = fb.door('accept', [c2b, c2], w2.blocks.slice(0, 2), { takes_pairs: false });
  Q(S, 'both of the pair in one push, takes_pairs false: taken / equivocations', `${r3.taken.length} / ${r3.equivocations.length}`);
  // the later blocks of a forked key are blocks of a fork (at or above the lower seq)
  const b3 = (maria.head = b2a.hash, maria.seq = 2, maria.write('thing', { name: 'three' }));
  const pool = new fb.Pool(w.blocks);
  Q(S, 'counts(b2a), counts(b2b), counts(b1), counts(b3 after the pair)', J([b2a, b2b, b1, b3].map(b => fb.counts(b, pool))));
  // two headers alone
  const wh = new World(); wh.blocks = w.blocks.slice(0, 2);
  const hA = headerMessage(b2a), hB = headerMessage(b2b);
  Q(S, 'fork_pairs of two held headers', J(fb.door('fork_pairs', [...wh.blocks, hA, hB]).map(p => p.map(short))));
  // different keys, one prev: never a pair
  const tablet = mkKey('tab'), KG = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tablet.pub }] }, { subject: maria.id, updates: maria.id });
  const tb = maria.asKey(tablet, KG.hash, b1.hash);
  const other = tb.write('thing', { name: 'tablet, on the same prev as two a' }, {}, { seq: 2, prev: b1.hash });
  Q(S, 'a block of another key on the same prev as two a (not a pair); pairs are still just the old one', J(fb.door('fork_pairs', w.blocks).filter(p => p.includes(other.hash)).length));
}

// ---------------------------------------------------------------- 7. a wire block respelled
{
  const S = '7 wire', w = new World(), maria = person(w, 'maria');
  const block = { type: 'thing', state: { name: 'sourdough', price: { value: '4.5', unit: 'GBP' }, at: day(0), audience: 'public', seq: 1 }, refs: { author: maria.id, prev: maria.id } };
  const text = cj(block);
  const st = t => (r => J(r.map(x => [x.code, x.hash === sha(Buffer.from(t, 'utf8')) ? 'hash of these bytes' : 'other hash'])))(fb.door('strict_text', t));
  Q(S, 'strict_text(the canonical bytes)', st(text));
  Q(S, 'strict_text(450.0 for 450)', st(text.replace('450', '450.0')));
  Q(S, 'strict_text(450 written 4.5e2)', st(text.replace('450', '4.5e2')));
  Q(S, 'strict_text(keys reordered: refs first)', st('{"type":"thing","state":' + cj(block.state) + ',"refs":' + cj(block.refs) + '}'));
  Q(S, 'strict_text(a space after a colon)', st(text.replace('"type":', '"type": ')));
  Q(S, 'strict_text(a newline at the end)', st(text + '\n'));
  Q(S, 'strict_text(an escape that is not the shortest, \\u0073 for s)', st(text.replace('sourdough', '\\u0073ourdough')));
  Q(S, 'strict_text(a repeated key)', st(text.replace('"seq":1', '"seq":1,"seq":1')));
  Q(S, 'strict_text(-0)', st(text.replace('"seq":1', '"seq":-0')));
  Q(S, 'strict_text(2^53)', st(text.replace('"value":"4.5"', '"value":"9007199254740992"')));
  Q(S, 'strict_text(2^53 - 1)', st(text.replace('"value":"4.5"', '"value":"9007199254740991"')));
  Q(S, 'strict_text(a null)', st(text.replace('"seq":1', '"seq":1,"zz":null')));
  Q(S, 'strict_text(not JSON)', st('hello'));
  Q(S, 'strict_text(a set not sorted in refs: check 1 on a canonical text)', st(cj({ type: 'thing', state: block.state, refs: { author: maria.id, prev: maria.id, derives_from: ['b'.repeat(64), 'a'.repeat(64)] } })));
  const deep = '{"refs":{},"state":{"a":' + '['.repeat(40) + ']'.repeat(40) + '},"type":"thing"}';
  Q(S, 'strict_text(nested deeper than limits.depth)', st(deep));
  const big = cj({ type: 'thing', state: { name: 'x'.repeat(70000) }, refs: {} });
  Q(S, 'strict_text(over limits.block_bytes)', st(big));
  Q(S, 'strict_text(over the limit and not canonical: size_limit first)', st(big.replace('"type":', '"type": ')));
  const m = message({ ...block, signature: 'ab' });
  const push = t => J(fb.door('strict_push', t));
  Q(S, 'strict_push(canonical)', push(cj({ messages: [message(w.blocks[0]), { block: block, signature: 'ab' }] })));
  Q(S, 'strict_push(message keys out of order)', push('{"messages":[{"signature":"ab","block":' + cj(block) + '}]}').replace(/"hash":"[0-9a-f]+"/, '"hash":"<h>"'));
  Q(S, 'strict_push(450.0 inside a block of a canonical-looking push)', push(cj({ messages: [{ block, signature: 'ab' }] }).replace('450', '450.0')).replace(/"hash":"[0-9a-f]+"/, '"hash":"<h>"'));
  Q(S, 'strict_push(a block with a null inside canonical bytes): the block alone is refused', push(cj({ messages: [{ block: { ...block, state: { ...block.state, z: null } }, signature: 'ab' }, { block, signature: 'ab' }] })));
  // wire: unwrap needs exactly { block, signature }
  const ok = fb.door('unwrap', { block: { type: block.type, state: block.state, refs: block.refs }, signature: 'ab' }, w.blocks);
  Q(S, 'unwrap(message): the id is the hash of the bytes as written in the suite of her key', String(ok.hash === sha(text)));
  for (const extra of [{ suite: 'std' }, { version: '1' }]) { try { fb.door('unwrap', { block, signature: 'ab', ...extra }, w.blocks); Q(S, 'unwrap(a message with ' + Object.keys(extra)[0] + ')', 'accepted'); } catch (e) { Q(S, 'unwrap(a message with ' + Object.keys(extra)[0] + ')', e.code); } }
}

// ---------------------------------------------------------------- 8. text in two Unicode spellings of one word
{
  const S = '8 text', w = new World(), maria = person(w, 'maria');
  const comp = 'café', decomp = 'café';
  const a = maria.write('thing', { name: comp }), b = (maria.head = w.blocks[0].hash, maria.seq = 0, maria.write('thing', { name: decomp }));
  Q(S, 'the two spellings are two texts: two ids', String(a.hash !== b.hash));
  Q(S, 'strict_text(composed), strict_text(decomposed)', J([fb.door('strict_text', cj({ type: a.type, state: a.state, refs: a.refs })), fb.door('strict_text', cj({ type: b.type, state: b.state, refs: b.refs }))].map(r => r.map(x => x.code))));
  Q(S, 'valid(composed), valid(decomposed)', J([valid(a, w.blocks), valid(b, w.blocks)]));
  const r = fb.door('accept', [a, b], [w.blocks[0]], { takes_pairs: true });
  Q(S, 'accept(both) takes_pairs true: taken (they also stand on one seq: a pair)', `${r.taken.length} ${r.equivocations.length}`);
  const k = maria.make('thing', { [decomp]: 1, name: 'a key in the decomposed spelling' }, {}, { seq: 3 });
  Q(S, 'a key not in NFC', codes(fb.door('valid', k, w.blocks)));
  const lone = '{"refs":{},"state":{"name":"\\ud800"},"type":"thing"}';
  Q(S, 'strict_text(a lone surrogate written as an escape)', codes(fb.door('strict_text', lone)));
  Q(S, 'strict_text(a lone surrogate, raw in the text)', codes(fb.door('strict_text', '{"refs":{},"state":{"name":"' + String.fromCharCode(0xd800) + '"},"type":"thing"}')));
  Q(S, 'strict_text(a noncharacter U+FFFF in a name)', codes(fb.door('strict_text', cj({ type: 'thing', state: { ...a.state, name: String.fromCharCode(0xffff) }, refs: a.refs }))));
  Q(S, 'valid(a block whose text holds a lone surrogate)', codes(fb.door('valid', { hash: 'a'.repeat(64), type: 'thing', state: { ...a.state, name: '\ud800' }, refs: a.refs, signature: a.signature }, w.blocks)));
}

// ---------------------------------------------------------------- 9. passkeys
{
  const S = '9 passkey', w = new World(), maria = person(w, 'maria');
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = '3059301306072a8648ce3d020106082a8648ce3d030107034200' + ec.publicKey.export({ format: 'der', type: 'spki' }).subarray(26).toString('hex');
  const N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
  const frame = (bytes, pad = 0, origin = true) => {
    const chal = crypto.createHash('sha256').update(bytes).digest('base64url');
    const cdj = Buffer.from('{"type":"webauthn.get","challenge":"' + chal + '"' + (origin ? ',"origin":"https://example.org"}' : '}') + 'x'.repeat(pad), 'utf8');
    const auth = Buffer.alloc(37); auth[32] = 1;
    const der = crypto.sign('sha256', Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]), ec.privateKey);
    // DER to r||s, with s low
    let i = 4, rl = der[3], r = der.subarray(i, i + rl); i += rl + 2; const sl = der[i - 1]; let s = der.subarray(i, i + sl);
    const strip = v => { while (v.length > 32 && v[0] === 0) v = v.subarray(1); return Buffer.concat([Buffer.alloc(32 - v.length), v]); };
    r = strip(r); s = strip(s); let sn = BigInt('0x' + s.toString('hex')); if (sn > N / 2n) sn = N - sn;
    const len = Buffer.alloc(2); len.writeUInt16BE(auth.length);
    return Buffer.concat([r, Buffer.from(sn.toString(16).padStart(64, '0'), 'hex'), len, auth, cdj]).toString('hex');
  };
  // a genesis of the p256 suite, signed by a passkey over its own bytes
  const gen = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', suite: 'p256', public_key_sign: spki }, refs: {} };
  const gh = sha(cj(gen));
  const gsig = frame(Buffer.from(cj(gen), 'utf8'));
  Q(S, 'valid(a genesis of the p256 suite signed by a passkey)', valid({ hash: gh, ...gen, signature: gsig }, []));
  Q(S, 'the challenge of a genesis is its id in base64url', String(fb.door('passkey_challenge', { hash: gh, ...gen }) === Buffer.from(gh, 'hex').toString('base64url')));
  // a block of that identity signed by the passkey over its header
  const blk = { type: 'thing', state: { name: 'a sale', at: day(0), audience: 'public', seq: 1 }, refs: { author: gh, prev: gh } };
  const bh = sha(cj(blk)), hbytes = Buffer.from(cj(headerOf(blk, bh)), 'utf8');
  Q(S, 'the challenge of a block is the SHA-256 of its header, base64url', String(fb.door('passkey_challenge', { hash: bh, ...blk }) === crypto.createHash('sha256').update(hbytes).digest('base64url')));
  const gfull = { hash: gh, ...gen, signature: gsig };
  Q(S, 'valid(a block signed by a passkey, 91-byte frame, nothing after it read)', valid({ hash: bh, ...blk, signature: frame(hbytes) }, [gfull]));
  Q(S, 'valid(the same, clientDataJSON with extra fields after the frame)', valid({ hash: bh, ...blk, signature: frame(hbytes, 40) }, [gfull]));
  Q(S, 'valid(the challenge of the block\'s own bytes, not its header)', valid({ hash: bh, ...blk, signature: frame(Buffer.from(cj(blk), 'utf8')) }, [gfull]));
  Q(S, 'valid(clientDataJSON with the origin missing: not the 91-byte frame)', valid({ hash: bh, ...blk, signature: frame(hbytes, 0, false) }, [gfull]));
  // the cap: a signature of 8192 bytes opens, of 8193 does not (pad the clientDataJSON)
  const fixed = 64 + 2 + 37, base = Buffer.from(frame(hbytes), 'hex').length;
  const at = n => frame(hbytes, n - base);
  const s8192 = at(8192), s8193 = at(8193);
  Q(S, 'signature lengths made', `${s8192.length / 2} ${s8193.length / 2}`);
  Q(S, 'valid(a passkey signature of exactly 8,192 bytes)', valid({ hash: bh, ...blk, signature: s8192 }, [gfull]));
  Q(S, 'valid(a passkey signature of 8,193 bytes: opens with no key)', valid({ hash: bh, ...blk, signature: s8193 }, [gfull]));
  Q(S, 'verify(block, passkey signature, key) 8,192 / 8,193', J([fb.door('verify', { hash: bh, ...blk }, s8192, spki), fb.door('verify', { hash: bh, ...blk }, s8193, spki)]));
  // flags: user presence off
  const noUp = Buffer.from(frame(hbytes), 'hex'); noUp[66 + 32] = 0;
  Q(S, 'verify with bit 0 of the flags byte off', String(fb.door('verify', { hash: bh, ...blk }, noUp.toString('hex'), spki)));
}

// ---------------------------------------------------------------- 10. a stranger's first push carries its pieces
{
  const S = '10 stranger push', w = new World(), maria = person(w, 'maria'), harry = person(w, 'harry'), harryW = new World();
  const hg = w.blocks[1];
  const node = new World(); node.blocks = [w.blocks[0]];
  const ask = harry.write('observe', { kind: 'message', said: 'can I buy bread?' }, { to: maria.id, subject: maria.id });
  const r = fb.door('accept', [ask, hg], node.blocks, { takes_pairs: false });
  Q(S, 'accept(Harry\'s ask and his genesis) into a node holding only Maria: taken', J(r.taken.map(h => h === hg.hash ? 'genesis' : h === ask.hash ? 'ask' : h)));
  Q(S, 'accept(the ask alone): unjudged needs his genesis', J((r2 => r2.unjudged.map(u => u.needs.map(n => n === hg.hash ? 'genesis' : n)))(fb.door('accept', [ask], node.blocks, { takes_pairs: false }))));
  // the signed push request: Harry's key signs; the node holds nothing of him, so the keys come from the pieces the push carries
  const keys = fb.door('live_keys', harry.id, [...node.blocks, hg, ask]);
  const body = { messages: [message(hg), message(ask)], for: { [ask.hash]: [maria.id] }, signer: harry.id, node: maria.id, counter: 1 };
  const req = { ...body, signature: signRaw(harry.key, cj(body)) };
  Q(S, 'the keys that may sign for Harry, read from the pieces carried', String(keys.length) + (keys[0] === harry.key.pub ? ' (his genesis key)' : ''));
  Q(S, 'the signed push is checked against those keys: refusals', J(fb.pushRefusals(req, { keys, node: maria.id, highest: undefined, issued: [] })));
  Q(S, 'with no pieces carried (node holds nothing of him): no key', J(fb.pushRefusals(req, { keys: fb.door('live_keys', harry.id, node.blocks), node: maria.id }).map(x => x.code)));
}

// ---------------------------------------------------------------- 11. per_stranger counts asks
{
  const S = '11 per_stranger', w = new World(), maria = person(w, 'maria'), harry = person(w, 'harry');
  const pieces = []; for (let i = 0; i < 60; i++) pieces.push(harry.write('thing', { name: 'harry thing ' + i }));
  const ask = harry.write('observe', { kind: 'message', said: 'hello' }, { to: maria.id });
  const rule = { per_stranger: 20 };
  Q(S, '60 pieces pushed first, then one ask: asks taken today = 0: refusals of the ask', codes(fb.door('admission_refusals', ask, maria.id, w.blocks, rule, 0)));
  Q(S, 'a piece (a block that names none of the node\'s people) with 20 asks taken: refusals', codes(fb.door('admission_refusals', pieces[0], maria.id, w.blocks, rule, 20)));
  Q(S, 'the 21st ask: asks taken today = 20', codes(fb.door('admission_refusals', ask, maria.id, w.blocks, rule, 20)));
  Q(S, 'the 20th ask: asks taken today = 19', codes(fb.door('admission_refusals', ask, maria.id, w.blocks, rule, 19)));
  Q(S, 'a listed party\'s ask with 20 taken', codes(fb.door('admission_refusals', ask, maria.id, w.blocks, { per_stranger: 20, parties: [harry.id] }, 20)));
  try { fb.door('admission_refusals', ask, maria.id, w.blocks, rule); Q(S, 'asks_today not stated', 'no error'); } catch (e) { Q(S, 'asks_today not stated', 'argument error'); }
}

// ---------------------------------------------------------------- 12. a push answer that lists unjudged and unread
{
  const S = '12 push answer', w = new World(), maria = person(w, 'maria'), tablet = mkKey('maria-tablet');
  const KG = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tablet.pub }] }, { subject: maria.id, updates: maria.id }, { keep: true });
  const t = maria.asKey(tablet, KG.hash);
  const lost = t.write('thing', { name: 'from the tablet' }, {}, { keep: true });
  const sparkle = maria.write('promise', { what: 'bread', sparkle: 1 }, {}, { keep: true });
  const plain = (maria.head = sparkle.hash, maria.seq = 2, maria.write('thing', { name: 'plain' }, {}, { keep: true }));
  const bad = { ...plain, state: { ...plain.state, name: 'tampered' } };
  const r = fb.door('accept', [lost, sparkle, plain, bad], [w.blocks[0]], { takes_pairs: false });
  const nm = h => ({ [lost.hash]: 'lost', [sparkle.hash]: 'sparkle', [plain.hash]: 'plain', [KG.hash]: 'KG' }[h] || short(h));
  Q(S, 'accept: taken', J(r.taken.map(nm)));
  Q(S, 'accept: unjudged', J(r.unjudged.map(u => [nm(u.hash), u.needs.map(nm)])));
  Q(S, 'accept: unread', J(r.unread.map(u => [nm(u.hash), u.codes])));
  Q(S, 'accept: refused', J(r.refused.map(x => [short(x.hash), x.code])));
  const node = mkKey('node');
  const ans = fb.door('push_answer', { taken: r.taken, unjudged: r.unjudged, refused: r.refused, unread: r.unread, equivocations: r.equivocations }, maria.id, node.priv.export({ format: 'der', type: 'pkcs8' }).toString('hex'));
  Q(S, 'push_answer: keys, in order', J(Object.keys(ans)));
  Q(S, 'push_answer: receipt and held left out; empty lists are []', J([ans.equivocations, 'receipt' in ans, 'held' in ans]));
  const ans2 = fb.door('push_answer', { held: [plain.hash, sparkle.hash], receipt: { header: { x: 1 }, header_signature: 'ab' }, unjudged: [], refused: [], unread: [], equivocations: [] }, maria.id, node.priv.export({ format: 'der', type: 'pkcs8' }).toString('hex'));
  Q(S, 'push_answer with held and receipt: keys', J(Object.keys(ans2)));
  Q(S, 'push_answer signature opens over the answer without it', String(fb.door('verify_message', ans, SPKIof(node))));
  // order independence
  const r2 = fb.door('accept', [bad, plain, sparkle, lost], [w.blocks[0]], { takes_pairs: false });
  Q(S, 'the same push in the reverse order gives the same answer', String(J({ ...r, refused: 0 }) === J({ ...r2, refused: 0 })));
}
function SPKIof(k) { return k.pub; }

// ---------------------------------------------------------------- 13. a node's log with a dropped receipt
{
  const S = '13 log', w = new World(), maria = person(w, 'maria'), harry = person(w, 'harry'), host = person(w, 'host'), doorKey = mkKey('host-door');
  const KG = host.write('grant', { kind: 'key', public_key_sign: doorKey.pub }, { subject: host.id });
  const Cg = host.write('observe', { kind: 'confirm' }, { confirms: KG.hash }); // her first voice signs it again: it stands
  const door = host.asKey(doorKey, KG.hash);
  const X = harry.write('thing', { name: 'an earlier thing' }), A = harry.write('observe', { kind: 'message', said: 'accept' }, { to: maria.id });
  const r1 = door.write('observe', { kind: 'receipt' }, { derives_from: [X.hash], subject: maria.id, after: [Cg.hash] }, { seq: 1 });
  const r2 = door.write('observe', { kind: 'receipt' }, { derives_from: [A.hash], subject: maria.id }, { seq: 2, key: undefined });
  const r3 = door.write('observe', { kind: 'receipt' }, { derives_from: [X.hash], subject: maria.id }, { seq: 3 });
  const logId = KG.hash, held = w.blocks;
  const req = { since: 1, limit: 10, filter: {}, log: logId, signer: maria.id, node: host.id, counter: 1, signature: 'ab' };
  const logEntries = [{ n: 1, block: X }];
  const ans = fb.door('answer_pull', logEntries, req, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', 3);
  const nm = h => ({ [X.hash]: 'X', [A.hash]: 'A' }[h] || short(h));
  Q(S, 'the answer: log is the one asked, next, n of each block', J([ans.log === logId, ans.next, ans.blocks.map(b => b.n), ans.request === sha(cj(req))]));
  Q(S, 'log_shown: receipt 2 puts A at 2, the answer covers 2 (since 1, next 3) and omits A: left_out', J(fb.door('log_shown', [r1, r2], req, ans, held).left_out.map(nm)));
  const dropped = door.write('observe', { kind: 'dropped' }, { derives_from: [A.hash] }, { seq: 4 });
  const ans4 = { ...ans, next: 4 };
  Q(S, 'with dropped (seq 4) naming A, next 4 (then nothing is left out)', J(fb.door('log_shown', [r1, r2, dropped], { ...req, since: 1 }, fb.door('answer_pull', logEntries, req, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', 4), held).left_out.map(nm)));
  const dropR = door.write('observe', { kind: 'dropped' }, { derives_from: [r2.hash] }, { seq: 5 });
  Q(S, 'dropped naming the receipt (seq 5), next 5', J(fb.door('log_shown', [r1, r2, dropR], req, fb.door('answer_pull', logEntries, req, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', 5), held).left_out.map(nm)));
  // a drop does not reach a block the door's person signed
  const mine = maria.write('thing', { name: 'her own' });
  const r6 = door.write('observe', { kind: 'receipt' }, { derives_from: [mine.hash], subject: maria.id }, { seq: 6 });
  const dMine = door.write('observe', { kind: 'dropped' }, { derives_from: [mine.hash] }, { seq: 7 });
  Q(S, 'a drop naming a block Maria signed: left_out still lists it', J(fb.door('log_shown', [r1, r6, dMine], { ...req, since: 1 }, fb.door('answer_pull', logEntries, req, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held.concat([mine]), 'std', 7), held.concat([mine])).left_out.map(h => h === mine.hash ? 'hers' : nm(h))));
  // answered not covering: since 2, next 3: A at 2 is below since
  Q(S, 'a number at or below since is not covered (since 2)', J(fb.door('log_shown', [r1, r2], { ...req, since: 2 }, fb.door('answer_pull', logEntries, { ...req, since: 2 }, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', 3), held).left_out.map(nm)));
  // a filter A does not match
  const reqF = { ...req, filter: { kind: 'receipt' } };
  Q(S, 'the request filters on kind receipt: A is no match, so not left out', J(fb.door('log_shown', [r1, r2], reqF, fb.door('answer_pull', logEntries, reqF, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', 3), held).left_out.map(nm)));
  // stopped short
  const reqS = { since: 1, limit: 10, filter: {}, log: logId, seen: r3.hash, signer: maria.id, node: host.id, counter: 2, signature: 'ab' };
  const short1 = fb.door('answer_pull', logEntries, reqS, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', 1);
  Q(S, 'stopped short: seen receipt 3, answer next 1 = since 1', J([short1.next, fb.door('log_shown', [r1, r2, r3], reqS, short1, held).stopped_short]));
  const full = fb.door('answer_pull', [...logEntries, { n: 3, block: X }], reqS, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', null);
  Q(S, 'a node that read to the seen receipt answers next 3: stopped_short', J([full.next, fb.door('log_shown', [r1, r2, r3], reqS, full, held).stopped_short]));
  // two logs: two receipts of one door key at one seq
  const r2b = door.make('observe', { kind: 'receipt' }, { derives_from: [X.hash], subject: maria.id }, { seq: 2, prev: r1.hash });
  Q(S, 'two logs: fork_pairs of two receipts of one door key at seq 2', J(fb.door('fork_pairs', [...held, r2b]).map(p => p.map(h => h === r2.hash ? 'r2' : h === r2b.hash ? 'r2b' : short(h)))));
  // the arrival number of a block with no receipt: n 0
  const ansP = fb.door('answer_pull', [{ n: 1, block: X }, { block: A }], { since: 0, filter: {} }, host.id, null, { cap: 10, serves_pairs: false }, maria.id, held, 'std', null);
  Q(S, 'a block with no arrival number is served only as a proof (not a match of since 0)', J(ansP.blocks.map(b => b.n)));
  Q(S, 'an answer with no log asked names none', J('log' in ansP));
}

// ---------------------------------------------------------------- 14. an export, whole and cut short
{
  const S = '14 export', w = new World(), maria = person(w, 'maria'), tablet = mkKey('maria-tablet'), host = person(w, 'host'), doorKey = mkKey('host-door');
  const KGm = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tablet.pub }] }, { subject: maria.id, updates: maria.id });
  const tb = maria.asKey(tablet, KGm.hash);
  const m1 = tb.write('thing', { name: 'one' }), m2 = tb.write('thing', { name: 'two' });
  const KG = host.write('grant', { kind: 'key', public_key_sign: doorKey.pub }, { subject: host.id });
  const Cg = host.write('observe', { kind: 'confirm' }, { confirms: KG.hash });
  maria.write('observe', { kind: 'confirm' }, { confirms: KGm.hash });
  const door = host.asKey(doorKey, KG.hash);
  const r1 = door.write('observe', { kind: 'receipt' }, { derives_from: [m1.hash], subject: maria.id, after: [Cg.hash] }, { seq: 1 });
  const r2 = door.write('observe', { kind: 'receipt', skip: true }, { derives_from: [m2.hash], subject: maria.id }, { seq: 3 });
  const doc = fb.exportOf(maria.id, w.blocks, KG.hash);
  const mh = h => ({ [m1.hash]: 'm1', [m2.hash]: 'm2', [KGm.hash]: 'KGm', [maria.id]: 'genesis' }[h] || short(h));
  Q(S, 'her export: the blocks in it', J(doc.messages.map(m => mh(sha(cj(m.block || {})) )).sort()).replace(/"[0-9a-f]{6}"/g, '"."'));
  Q(S, 'the export is canonical JSON, each block as signed: the document', String(typeof fb.jcs(doc) === 'string' && doc.format === 'application/foodblock+json'));
  Q(S, 'exportWhole(her export, the door log, receipt 3 she holds)', J(fb.exportWhole(doc, KG.hash, r2.hash)));
  const without = ids => ({ ...doc, messages: doc.messages.filter(m => !(m.block && ids.includes(sha(cj(m.block))))) });
  Q(S, 'the same with a block a receipt names removed (m1)', J(fb.exportWhole(without([m1.hash]), KG.hash, r2.hash)));
  Q(S, 'the same with a piece removed (her key grant)', J(fb.exportWhole(without([KGm.hash]), KG.hash, r2.hash)));
  Q(S, 'the same with receipt 1 removed: the door log has a hole', J(fb.exportWhole(without([r1.hash]), KG.hash, r2.hash)));
  // dropped excuses a block
  const dropped = door.write('observe', { kind: 'dropped' }, { derives_from: [m1.hash] }, { seq: 4 });
  const doc2 = fb.exportOf(maria.id, w.blocks, KG.hash);
  const cut = { ...doc2, messages: doc2.messages.filter(m => !(m.block && sha(cj(m.block)) === m1.hash)) };
  Q(S, 'm1 is missing though a dropped names it; a receipt names it too and m2\'s line reaches back to it', J(fb.exportWhole(cut, KG.hash, dropped.hash)));
}
