// Stage 2 of FoodBlock 1.8, the store (changes-1.8/02-store.md): its stories as signed worlds both engines can be run on. Each world is a
// `World` (lib.cjs). Each question names a door op, its arguments (the blocks held when it was asked), `expect` (what the spec text says,
// with `text`, the sentence it says it in) and `core` (what the Rust core answered). Run alone (`node test/audit/k2-store.cjs`) it prints
// every question and each place the core differs from the text; `require` it for `{ worlds, questions }`.
const crypto = require('crypto')
const { World, fb, oracle, handSign } = require('./lib.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')

const questions = []
const codes = (r) => (Array.isArray(r) ? r.map((x) => x.code) : r)
// strict_push answers { refused, messages } (CORE-SET 3a-8): the code of the push's refusal, or the messages it reads
const pushed = (r) => (r && r.refused ? [r.refused.code] : r && r.messages)
let minute = 0
const at = () => new Date(Date.UTC(2026, 10, 11) + ++minute * 60000).toISOString().replace(/\.\d+Z$/, '.000Z')

function ask(w, kase, question, op, args, expect, text, view = (x) => x) {
  const real = args.map((a) => (a === 'held' ? w.blocks.slice() : a))
  const answer = (engine) => { try { return engine(op, ...JSON.parse(JSON.stringify(real))) } catch (e) { return { error: String(e.message).split('\n')[0], ...(e.code ? { code: e.code } : {}) } } }
  // `whole` is each engine's whole answer (run.cjs compares the two); `core` is the part the question reads, compared with `expect`
  const whole = answer(call), oracleWhole = answer(oracle.door)
  let core
  try { core = view(whole) } catch (_) { core = whole }
  questions.push({ world: w.name, case: kase, question, op, args: real, expect, text, core, whole, oracleWhole, agrees: JSON.stringify(core) === JSON.stringify(expect) })
  return core
}

// A block signed by hand, at a place on a line the caller names: `prev`, `seq`, and `key` (the key grant that brought `keys` in) when
// the signing key is not the author's genesis key. What the writer would refuse can be written this way, to ask what a reader says of it.
function signed(p, keys, type, state, refs, { prev, seq, keyRef, audience = 'public' }) {
  const block = fb.create(type, { at: at(), audience, seq, ...state }, { author: p.id, prev, ...(keyRef ? { key: keyRef } : {}), ...refs })
  return { ...block, signature: handSign(block, keys.private_key) }
}
const next = (w, p, keys) => fb.identity.nextLinkFor(p.id, keys.public_key_sign, w.blocks)

// ---- 1. A block an older reader cannot read, and the next block of that key ----
{
  const w = new World('k2 a field an older reader cannot read')
  const maria = w.person('maria')
  const l = next(w, maria, maria.keys)
  const b41 = w.add(signed(maria, maria.keys, 'promise', { what: 'loaves', sparkle: 'a field of a newer version' }, {}, { prev: l.prev, seq: l.seq }), 'block 41: a promise with state.sparkle')
  const b42 = w.w(maria, 'thing', { kind: 'loaf' }, {}, 'block 42: a plain thing')
  ask(w, 'not read', 'block 41 is valid: her key signed it', 'valid', [b41, 'held'], [], 'core.md 8: a block that is valid and not read is kept as its header and counts in no fold; it is never refused for being unreadable', codes)
  ask(w, 'not read', 'block 41 is not read', 'read', [b41, 'held'], ['undeclared_field'], 'core.md 8, check 8: a closed type has ... no undeclared ones (undeclared_field)', codes)
  ask(w, 'not read', 'block 42, the next block of that key, is valid', 'valid', [b42, 'held'], [], 'core.md 8: valid reads no prev', codes)
  ask(w, 'not read', 'block 42 is read', 'read', [b42, 'held'], [], 'core.md 8: read reads the blocks it names for its meaning; prev is none', codes)
  const genesis = w.blocks[0]
  ask(w, 'not read', 'a node takes both and lists 41 in unread', 'accept', [[b41, b42], [genesis], { takes_pairs: false }, null],
    { taken: [b41.hash, b42.hash].sort(), unread: [{ hash: b41.hash, codes: ['undeclared_field'] }] },
    'nodes.md, Push: a valid block is taken; it is then read, and one that is not read is listed in unread with its codes and held as its header',
    (a) => ({ taken: a.taken, unread: a.unread }))
  ask(w, 'not read', 'her line from 42 back to her genesis is not read whole: 41 is held as its header', 'read_whole', [b42.hash, maria.id, 'held'],
    { whole: false, lacks: [b41.hash] }, 'folds.md, A line: a block held only as its header leaves the line not whole ... its id where a held prev names it')
}

// ---- 2. A lost block on a key's line ----
{
  const w = new World('k2 a lost block')
  const maria = w.person('maria')
  const b = [1, 2, 3, 4, 5].map((n) => w.w(maria, 'observe', { kind: 'note', text: `block ${n}` }, {}, `block ${n}`))
  const without3 = w.blocks.filter((x) => x.hash !== b[2].hash)
  ask(w, 'lost block', 'block 4 is valid with block 3 lost', 'valid', [b[3], without3], [], 'core.md 9, invariant 25: No block waits for its prev, and no verdict of valid changes for want of a block', codes)
  ask(w, 'lost block', 'the line from 4 back to 1, 3 lost', 'read_whole', [b[3].hash, b[0].hash, without3], { whole: false, lacks: [b[2].hash] },
    'folds.md, A line: lists in lacks each block it would need: its id where a held prev names it, else { author, key, seq } (02-store vector 8 gives { author, key, seq: 3 } here, though block 4\'s prev names block 3)')
  const without34 = without3.filter((x) => x.hash !== b[3].hash)
  ask(w, 'lost block', 'the line from 5 back to 1, 3 and 4 lost', 'read_whole', [b[4].hash, b[0].hash, without34], { whole: false, lacks: [b[3].hash, { author: maria.id, key: null, seq: 3 }] },
    'folds.md, A line: its id where a held prev names it, else { author, key, seq } (key null for the genesis key)')
  ask(w, 'lost block', 'with the block found, the line is whole', 'read_whole', [b[3].hash, b[0].hash, 'held'], { whole: true, lacks: [] }, 'folds.md, A line: Filling a hole never changes an answer, because with the hole there was none')
  ask(w, 'lost block', 'a start that is not on the line', 'read_whole', [b[3].hash, w.person('sam').id, 'held'], { error: 'argument' }, '02-store, section 4: A start not on the block\'s line is an argument error', (a) => (a && a.error ? { error: 'argument' } : a))
  ask(w, 'lost block', 'the chain fold shows the gap', 'check_chain', [without3.filter((x) => x.refs.author === maria.id && x.state.seq), maria.id], [3], 'core.md 5: the chain fold shows it (broken, gaps)', (c) => c.gaps)
}

// ---- 3. A block before its key grant ----
{
  const w = new World('k2 a block before its key grant')
  const maria = w.person('maria')
  const tablet = fb.generateKeypair()
  const grant = w.w(maria, 'grant', { kind: 'key', public_key_sign: tablet.public_key_sign }, { subject: maria.id }, 'her phone brings in a tablet key under its voice')
  const first = w.w(maria, 'observe', { kind: 'note', text: 'from the tablet' }, {}, 'the tablet\'s first block', { key: tablet })
  const before = w.blocks.filter((x) => x.hash !== grant.hash)
  ask(w, 'before its key grant', 'the tablet block names its key grant in refs.key', 'header', [first], grant.hash, 'privacy.md, The public header: plus key when the block has refs.key', (h) => h.key)
  ask(w, 'before its key grant', 'the tablet block, its key grant not held', 'valid', [first, before], ['unmet'], 'core.md 8, check 5: Each piece is held and valid (unmet, naming each one not held)', codes)
  ask(w, 'before its key grant', 'unmet names the key grant', 'valid', [first, before], true, 'core.md 8, check 5: naming each one not held', (r) => r[0].detail.includes(grant.hash))
  ask(w, 'before its key grant', 'once the key grant arrives', 'valid', [first, 'held'], [], 'core.md 8: unmet and unknown_suite are waits: a block that gets one is judged again when what it lacks is held', codes)
  ask(w, 'before its key grant', 'a push of the block alone: unjudged, with the piece it needs', 'accept', [[first], before.filter((x) => x.hash !== first.hash), { takes_pairs: false }, null], [{ hash: first.hash, needs: [grant.hash] }],
    'nodes.md, Push: One whose pieces are not all there is unjudged (unjudged, with the pieces it lacks as needs)', (a) => a.unjudged)
  // a key grant signed by the key it brings in, naming no refs.key (02-store vector 4)
  const forger = fb.generateKeypair()
  const l = next(w, maria, maria.keys)
  const forged = w.add(signed(maria, forger, 'grant', { kind: 'key', public_key_sign: forger.public_key_sign }, { subject: maria.id }, { prev: l.prev, seq: l.seq }), 'a forged key grant: signed by the key it brings in')
  ask(w, 'before its key grant', 'the forged key grant', 'valid', [forged, 'held'], ['bad_signature'], 'core.md 8, check 6: A block with no refs.key is signed by its author\'s genesis key ... (bad_signature)', codes)
  const by = signed(maria, forger, 'observe', { kind: 'note' }, {}, { prev: forged.hash, seq: 1, keyRef: forged.hash })
  ask(w, 'before its key grant', 'a block naming the forged key grant', 'valid', [by, 'held'], ['bad_piece'],
    'core.md 8, check 5: One held and refused is bad_piece, naming it and its code: a piece\'s id is the hash of its bytes, so it can never become valid, and nor can a block that rests on it', codes)
}

// ---- 4. A suite the reader does not know ----
{
  const w = new World('k2 a suite the reader does not know')
  const maria = w.person('maria')
  const unknown = 'sha3-256:' + 'ab'.repeat(32)
  const l = next(w, maria, maria.keys)
  const b = signed(maria, maria.keys, 'observe', { kind: 'note' }, { subject: unknown }, { prev: l.prev, seq: l.seq })
  // 1.9 CORE-SET 3a: valid reads no id but its header's; an id in a block's body in a hash this reader does not know is read's `unknown_suite`
  ask(w, 'unknown suite', 'a block naming an id in a hash this reader does not know is valid', 'valid', [b, 'held'], [],
    'core.md 8: valid reads no prev, no other link; CORE-SET 3a (decided): an id outside its grammar in a block\'s body keeps unknown_suite in read', codes)
  ask(w, 'unknown suite', 'and read cannot read it (unknown_suite)', 'read', [b, 'held'], ['unknown_suite'], 'CORE-SET 3a (decided): unknown_suite in read', codes)
  ask(w, 'unknown suite', 'a push takes it and lists it unread', 'accept', [[b], 'held', { takes_pairs: false }, null], { taken: [b.hash], unjudged: [], refused: [] },
    'nodes.md, Push: a valid block is taken; one that is not read is listed in unread', (a) => ({ taken: a.taken, unjudged: a.unjudged, refused: a.refused }))
}

// ---- 5. A held header that is not the signed header ----
{
  const w = new World('k2 a held header')
  const maria = w.person('maria')
  const tablet = fb.generateKeypair()
  const grant = w.w(maria, 'grant', { kind: 'key', public_key_sign: tablet.public_key_sign }, { subject: maria.id }, 'a tablet key')
  const sealed = fb.write('observe', { kind: 'note', text: 'for sam' }, {}, { author: maria.id, key: tablet, held: w.blocks, at: at(), audience: [w.person('sam').id] })
  const message = { header: fb.header(sealed), header_signature: sealed.signature }
  ask(w, 'held header', 'the header message, its pieces held', 'valid', [message, 'held'], [], 'core.md 8, A held header: valid of a header checks its keys, its pieces and its signature', codes)
  ask(w, 'held header', 'the same with key changed in the header', 'valid', [{ ...message, header: { ...message.header, key: maria.id } }, 'held'], ['bad_signature'], 'core.md 8, check 6 (02-store vector 11: with key changed in the header: bad_signature)', codes)
  ask(w, 'held header', 'the same with seq changed', 'valid', [{ ...message, header: { ...message.header, seq: 9 } }, 'held'], ['bad_signature'], 'core.md 2: A block is signed over its header', codes)
  ask(w, 'held header', 'a header with a key it may not carry', 'valid', [{ ...message, header: { ...message.header, at: '2026-11-11T00:00:00.000Z' } }, 'held'], ['chain'], 'core.md 8, A held header: its keys (protocol.json, header, header_optional); CORE-SET 3a (decided): a held header\'s wrong keys are chain', codes)
  ask(w, 'held header', 'read is not asked of a header', 'read', [message, 'held'], { error: 'argument' }, 'core.md 8: A block held by its header alone is not read, and read is not asked of it', (a) => (a && a.error ? { error: 'argument' } : a))
  void grant
}

// ---- 6. Pairs: one prev, or one seq ----
{
  const w = new World('k2 pairs')
  const maria = w.person('maria')
  const six = [1, 2, 3, 4, 5, 6].map((n) => w.w(maria, 'observe', { kind: 'note', text: `${n}` }, {}, `block ${n}`))[5]
  const a = w.add(signed(maria, maria.keys, 'observe', { kind: 'note', text: '7a' }, {}, { prev: six.hash, seq: 7 }), '7a on 6')
  const b = signed(maria, maria.keys, 'observe', { kind: 'note', text: '7b' }, {}, { prev: six.hash, seq: 7 })
  ask(w, 'pairs', 'two blocks of one key on one prev', 'fork_pairs', [[...w.blocks, b]], [[a.hash, b.hash].sort()], 'core.md 9, invariant 3: Two that do are a pair', (p) => p)
  const made = signed(maria, maria.keys, 'observe', { kind: 'note', text: '7c' }, {}, { prev: 'cd'.repeat(32), seq: 7 })
  ask(w, 'pairs', 'two blocks at one seq, one naming a made-up prev', 'fork_pairs', [[...w.blocks, made]], [[a.hash, made.hash].sort()], 'core.md 9, invariant 3: no two name the same prev or state the same seq', (p) => p)
  const only = w.blocks.filter((x) => x.hash === maria.id)
  ask(w, 'pairs', 'with nothing else held, a push lists the pair', 'accept', [[a, made], only, { takes_pairs: false }, null], { taken: [], equivocations: [[a.hash, made.hash].sort()] },
    'nodes.md, Push: a node that does not takes neither when both arrive in one push', (x) => ({ taken: x.taken, equivocations: x.equivocations }))
  const sealedA = { header: fb.header(a), header_signature: a.signature }, sealedB = { header: fb.header(b), header_signature: b.signature }
  ask(w, 'pairs', 'a pair of two headers alone', 'fork_pairs', [[maria.g, sealedA, sealedB]], [[a.hash, b.hash].sort()], 'nodes.md, Equivocation: it needs no line, only the two (or their headers)', (p) => p)
  ask(w, 'pairs', 'the chain fold names the pair by seq', 'check_chain', [[...w.blocks.filter((x) => x.state.seq), made], maria.id], [[a.hash, made.hash].sort()], 'folds.md, chain: the pairs that prove each group of blocks taking one place or stating one seq', (c) => c.equivocations)
}

// ---- 7. The wire: one spelling ----
{
  const w = new World('k2 the wire')
  const maria = w.person('maria')
  // a count is still an integer (core.md, section 3): a herd's tally of 450 head (things.md, A herd is an instance measured in head), respelled on the wire
  const loaf = w.w(maria, 'observe', { kind: 'tally', count: 450 }, {}, 'a tally, count 450')
  const text = call('canonical', loaf.type, loaf.state, loaf.refs)
  const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')
  ask(w, 'wire', 'the canonical bytes', 'strict_text', [text], [], 'canonical.md, On the wire: takes them only if they are exactly those bytes', codes)
  for (const [what, respelled] of [['450.0', text.replace('450', '450.0')], ['reordered keys', JSON.stringify({ type: loaf.type, state: loaf.state, refs: loaf.refs })], ['extra whitespace', text.replace('{"refs"', '{ "refs"')]]) {
    ask(w, 'wire', `respelled with ${what}`, 'strict_text', [respelled], [{ hash: sha(respelled), code: 'not_canonical' }], 'canonical.md, On the wire: Any difference refuses the message (not_canonical) ... A refusal names bytes: its hash is the SHA-256 of the bytes refused, as they came', (r) => r.map((x) => ({ hash: x.hash, code: x.code })))
  }
  const push = (blockText) => `{"messages":[{"block":${blockText},"signature":"${loaf.signature}"}]}`
  ask(w, 'wire', 'a push with a respelled block is refused whole', 'strict_push', [push(text.replace('450', '450.0'))], ['not_canonical'], 'nodes.md, Push: bytes that are not canonical refuse the whole push (not_canonical), and nothing in it is judged; CORE-SET 3a-8: strict_push is { refused, messages }', pushed)
  ask(w, 'wire', 'a canonical push', 'strict_push', [push(text)], [[]], 'nodes.md, Push: a push is one message, read by the wire rule', pushed)
  ask(w, 'wire', 'a message key out of order', 'strict_push', [`{"messages":[{"signature":"${loaf.signature}","block":${text}}]}`], ['not_canonical'], '02-store vector 18: {"signature":...,"block":...}: not_canonical (message), the push refused as one message', pushed)
  const deep = `{"messages":[{"block":${text},"signature":"${loaf.signature}","x":${'['.repeat(70)}${']'.repeat(70)}}]}`
  ask(w, 'wire', 'a push nested deeper than limits.read_depth', 'strict_push', [deep], ['size_limit'], 'encoding.md, Limits: A reader reads nothing nested deeper than limits.read_depth (64 levels); CORE-SET 3a-1: past the depth is size_limit', pushed)
  ask(w, 'wire', 'a message with a suite key', 'unwrap', [{ ...fb.wrap(loaf), suite: 'std' }], 'shape', 'core.md 6: exactly { block, signature }: any other key refuses it (shape)', (r) => (r && r.error ? r.code : r))
}

// ---- 8. Text: two Unicode spellings of one word ----
{
  const w = new World('k2 two spellings')
  const maria = w.person('maria')
  const nfc = w.w(maria, 'thing', { kind: 'café' }, {}, 'café, composed (NFC)')
  const nfd = w.w(maria, 'thing', { kind: 'café' }, {}, 'café, decomposed (NFD)')
  ask(w, 'two spellings', 'two different texts, two ids', 'hash', [nfc.type, nfc.state, nfc.refs], nfc.hash !== nfd.hash, 'core.md 3: Two texts are the same when their bytes are the same', (h) => h === nfc.hash && h !== nfd.hash)
  ask(w, 'two spellings', 'both taken', 'accept', [[nfc, nfd], [maria.g, ...w.blocks.filter((x) => x.state.seq && x.state.seq < nfc.state.seq)], { takes_pairs: false }, null], { taken: [nfc.hash, nfd.hash].sort(), refused: [] },
    'core.md 3: Nothing else about text is checked: no normal form, no table, no Unicode version', (a) => ({ taken: a.taken, refused: a.refused }))
}

// ---- 9. A passkey signature within and past the size limit ----
{
  const w = new World('k2 passkey')
  const keys = fb.generateKeypair('p256')
  const g = fb.identity.genesis(keys, { kind: 'person', at: at(), audience: 'public' })
  w.add(g, 'genesis of a passkey')
  const block = fb.create('observe', { kind: 'note', at: at(), audience: 'public', seq: 1 }, { author: g.hash, prev: g.hash })
  const challenge = call('passkey_challenge', block)
  const point = Buffer.from(keys.public_key_sign.slice(-130), 'hex')
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: Buffer.from(keys.private_key, 'hex').toString('base64url'), x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' })
  // flags: user present and user verified (1.9 CORE-SET 3d-13: a touch alone signs nothing)
  const auth = Buffer.concat([Buffer.alloc(32, 7), Buffer.from([5]), Buffer.alloc(4)])
  const passkey = (total) => {
    const frame = `{"type":"webauthn.get","challenge":"${challenge}","origin":"`
    const cdj = Buffer.from(frame + 'https://example.org"}'.padEnd(total - 103 - frame.length, ' '))
    const sig = crypto.sign('sha256', Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]), { key, dsaEncoding: 'ieee-p1363' })
    return call('passkey_signature', auth.toString('hex'), cdj.toString('hex'), sig.toString('hex'))
  }
  const at8192 = passkey(8192), at8193 = passkey(8193)
  ask(w, 'passkey', 'a passkey signature of 8,192 bytes over the header', 'valid', [{ ...block, signature: at8192 }, 'held'], [], 'encoding.md, Bytes: at most limits.signature_bytes bytes (8,192)', codes)
  ask(w, 'passkey', 'one of 8,193 bytes', 'valid', [{ ...block, signature: at8193 }, 'held'], ['bad_signature'], 'encoding.md, Bytes: a longer one opens with no key', codes)
  const wrongFrame = (() => {
    const cdj = Buffer.from(`{"challenge":"${challenge}","type":"webauthn.get","origin":"https://example.org"}`)
    const sig = crypto.sign('sha256', Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]), { key, dsaEncoding: 'ieee-p1363' })
    return call('passkey_signature', auth.toString('hex'), cdj.toString('hex'), sig.toString('hex'))
  })()
  ask(w, 'passkey', 'clientDataJSON with its keys in another order', 'valid', [{ ...block, signature: wrongFrame }, 'held'], ['bad_signature'], 'encoding.md, Passkeys, The check 3: clientDataJSON begins with exactly these bytes ... no JSON is parsed', codes)
}

// ---- 10. A stranger's first signed push; per_stranger counts asks ----
{
  const w = new World('k2 a stranger at the door')
  const maria = w.person('maria')
  const node = w.blocks.slice()
  const harry = w.person('harry')
  const offer = w.w(maria, 'promise', { terms: { quantity: fb.amount('1', 'loaf') } }, { what: maria.id, from: maria.id }, 'maria\'s offer')
  const ask1 = w.w(harry, 'observe', { kind: 'note', text: 'hello maria' }, { to: maria.id }, 'harry\'s ask, naming maria')
  const push = fb.sync.signPush(fb.sync.pushRequest([fb.wrap(harry.g), fb.wrap(ask1)]), { signer: harry.id, node: maria.id, privateKey: harry.keys.private_key, counter: 1 })
  const keys = call('live_keys', harry.id, [harry.g])
  ask(w, 'stranger', 'the signed push is checked against the pieces it carries', 'push_refusals', [push, { node: maria.id, keys, highest: null, issued: [] }], [], 'nodes.md, Messages: A signed request from a signer the node does not hold is checked against the pieces the push carries', codes)
  ask(w, 'stranger', 'his genesis and his ask, to a node that holds nothing of his', 'accept', [[harry.g, ask1], [...node, offer], { takes_pairs: false }, null], [harry.id, ask1.hash].sort(), 'nodes.md, Push: Every block of a push is judged by valid against what the node holds and the rest of the push', (a) => a.taken)
  const adm = { per_stranger: 20 }
  ask(w, 'stranger', 'his genesis (a piece) with 60 blocks today', 'admission_refusals', [harry.g, maria.id, 'held', adm, 60], [], 'nodes.md, Admission: a block\'s pieces, and the blocks its answer reads, are never counted', codes)
  ask(w, 'stranger', 'his first ask, no asks today', 'admission_refusals', [ask1, maria.id, 'held', adm, 0], [], 'nodes.md, Admission: per_stranger is the most asks one day may bring from each sender', codes)
  ask(w, 'stranger', 'an ask past per_stranger', 'admission_refusals', [ask1, maria.id, 'held', adm, 20], ['not_admitted'], 'nodes.md, Admission: When the node has taken that many asks today from that sender, the next is not_admitted (asks_today >= per_stranger)', codes)
}

// ---- 11. A push answer listing unjudged and unread ----
{
  const w = new World('k2 a push answer')
  const maria = w.person('maria'), node = w.person('node')
  const tablet = fb.generateKeypair()
  const grant = w.w(maria, 'grant', { kind: 'key', public_key_sign: tablet.public_key_sign }, { subject: maria.id }, 'a tablet key')
  const early = w.w(maria, 'observe', { kind: 'note' }, {}, 'a tablet block', { key: tablet })
  const l = next(w, maria, maria.keys)
  const odd = w.add(signed(maria, maria.keys, 'promise', { what: 'x', sparkle: 1 }, {}, { prev: l.prev, seq: l.seq }), 'a promise with a field no list knows')
  const held = [maria.g, node.g]
  const got = call('accept', [early, odd], held, { takes_pairs: false }, null)
  ask(w, 'push answer', 'the push of a tablet block (its key grant not held) and a promise no list knows', 'accept', [[early, odd], held, { takes_pairs: false }, null],
    { taken: [odd.hash], unjudged: [{ hash: early.hash, needs: [grant.hash] }], unread: [{ hash: odd.hash, codes: ['undeclared_field'] }] },
    'nodes.md, Messages: A push answer is { node, receipt, taken, held, unjudged, refused, unread, equivocations, signature }', (a) => ({ taken: a.taken, unjudged: a.unjudged, unread: a.unread }))
  ask(w, 'push answer', 'the signed answer', 'push_answer', [got, node.id, node.keys.private_key, null], ['equivocations', 'node', 'refused', 'signature', 'taken', 'unjudged', 'unread'],
    'nodes.md, Messages: every key is always present but receipt and held', (a) => Object.keys(a).sort())
}

// ---- 12. A node's door log, a dropped receipt, a pull answer ----
const doorLog = (() => {
  const w = new World('k2 a door log')
  const maria = w.person('maria'), harry = w.person('harry'), node = w.person('node')
  const doorKey = fb.generateKeypair()
  const log = w.w(node, 'grant', { kind: 'key', public_key_sign: doorKey.public_key_sign }, { subject: node.id }, 'the node\'s key for maria\'s door')
  const again = w.w(node, 'observe', { kind: 'note' }, { confirms: [log.hash] }, 'the node signs its door key again (blocks.md, Finality, rule 13)')
  const offer = w.w(maria, 'promise', { terms: { quantity: fb.amount('1', 'loaf') } }, { what: maria.id, from: maria.id }, 'maria\'s offer')
  const accept = w.w(harry, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, 'harry\'s accept')
  const note = w.w(harry, 'observe', { kind: 'note', text: 'see you friday' }, { to: maria.id }, 'harry\'s note')
  const receipt = (blocks, extra = {}, note2) => w.add(fb.write('observe', { kind: 'receipt' }, { derives_from: blocks.map((b) => b.hash).sort(), subject: maria.id, ...extra }, { author: node.id, key: doorKey, held: w.blocks, at: at(), audience: [maria.id, harry.id], after: [again.hash] }), note2)
  const r1 = receipt([offer], {}, 'receipt 1: the offer')
  const r2 = receipt([accept], {}, 'receipt 2: harry\'s accept')
  const r3 = receipt([note], {}, 'receipt 3: harry\'s note')
  const entries = [{ n: r1.state.seq, block: offer }, { n: r2.state.seq, block: accept }, { n: r3.state.seq, block: note }]
  const request = fb.sync.signPull({ since: 1, log: log.hash, seen: r3.hash }, { signer: maria.id, node: node.id, privateKey: maria.keys.private_key, counter: 1 })
  const answer = (shown, nextN) => {
    const a = call('answer_pull', shown, request, node.id, node.keys.private_key, { cap: 10, serves_pairs: false }, maria.id, null, null, nextN)
    return a
  }
  const without = answer(entries.filter((e) => e.block.hash === note.hash), 3)
  ask(w, 'door log', 'an answer that names its log', 'answer_pull', [entries, request, node.id, node.keys.private_key, { cap: 10, serves_pairs: false }, maria.id, null, null, 3], log.hash, 'nodes.md, Pull: The answer names its log', (a) => a.log)
  ask(w, 'door log', 'receipt 2 puts harry\'s accept at 2; an answer since 1, next 3, without it', 'log_shown', [[r1, r2, r3], request, without, 'held'], { left_out: [accept.hash], stopped_short: false },
    'nodes.md, The arrival log: Left out. A receipt puts a block at a number; a pull answer signed for the same log covers that number ...')
  const dropped = w.add(fb.write('observe', { kind: 'dropped' }, { derives_from: [accept.hash], subject: maria.id }, { author: node.id, key: doorKey, held: w.blocks, at: at(), audience: [maria.id, harry.id] }), 'the node drops harry\'s accept')
  const later = answer(entries.filter((e) => e.block.hash === note.hash), dropped.state.seq)
  ask(w, 'door log', 'with a dropped at or below next naming it', 'log_shown', [[r1, r2, r3, dropped], request, later, 'held'], { left_out: [], stopped_short: false }, 'nodes.md, The arrival log: no dropped at or below next names it')
  const short = answer([], 1)
  ask(w, 'door log', 'a request that has seen receipt 3, an answer whose next is its since', 'log_shown', [[r1, r2, r3], request, short, 'held'], { left_out: [], stopped_short: true }, 'nodes.md, The arrival log: Stopped short. The answer\'s next is below that receipt\'s seq and equals the request\'s since')
  const twin = { ...fb.create('observe', { ...r3.state, kind: 'receipt' }, { ...r3.refs, derives_from: [offer.hash] }) }
  const twinSigned = { ...twin, signature: handSign(twin, doorKey.private_key) }
  ask(w, 'door log', 'two receipts of the door key at one seq', 'fork_pairs', [[...w.blocks, twinSigned]], [[r3.hash, twinSigned.hash].sort()], 'nodes.md, The arrival log: Two logs. Two receipts of one log\'s key that name one prev or state one seq: a pair', (p) => p)
  return { w, maria, harry, node, log, offer, accept, note, r1, r2, r3, dropped }
})()

// ---- 13. Leaving: an export whole, and one cut short ----
{
  const { w, log, r1, r2, r3, dropped, offer, accept, note, maria, harry, node } = doorLog
  const messages = [maria.g, harry.g, node.g, log, offer, accept, note, r1, r2, r3, dropped].map((b) => fb.wrap(b))
  const doc = { format: 'application/foodblock+json', messages }
  ask(w, 'export', 'her export, whole', 'export_whole', [doc, log.hash, dropped.hash], { whole: true, lacks: [] }, 'nodes.md, A host: An export is whole when the door log runs unbroken from its first receipt to a receipt she holds; every block a receipt on it names is in it or named by a dropped; every piece of every block in it is in it')
  const cut = { ...doc, messages: messages.filter((m) => fb.unwrap(m).hash !== note.hash) }
  ask(w, 'export', 'the same with the note a receipt names taken out', 'export_whole', [cut, log.hash, dropped.hash], { whole: false, lacks: [note.hash] }, 'nodes.md, A host: every block a receipt on it names is in it or named by a dropped')
  const gap = { ...doc, messages: messages.filter((m) => fb.unwrap(m).hash !== r2.hash) }
  ask(w, 'export', 'the same with receipt 2 taken out', 'export_whole', [gap, log.hash, dropped.hash], { whole: false, lacks: [r2.hash] }, 'nodes.md, A host: the door log runs unbroken from its first receipt to a receipt she holds')
}

// ---- 14. A line across a key replacement (02-store vector 10) ----
{
  const w = new World('k2 a line across a key replacement')
  const maria = w.person('maria')
  const phone = fb.generateKeypair()
  const first = w.w(maria, 'grant', { kind: 'key', voices: [{ key: maria.keys.public_key_sign }] }, { subject: maria.id, updates: maria.id }, 'her list, one voice')
  const old = [1, 2, 3].map((n) => w.w(maria, 'observe', { kind: 'note', text: `old ${n}` }, {}, `old ${n}`))
  const move = w.w(maria, 'grant', { kind: 'key', voices: [{ key: phone.public_key_sign }] }, { subject: maria.id, updates: first.hash }, 'the old key puts a new key in its place')
  const n1 = w.w(maria, 'observe', { kind: 'note', text: 'new 1' }, {}, 'new 1', { key: phone })
  const n2 = w.w(maria, 'observe', { kind: 'note', text: 'new 2' }, {}, 'new 2', { key: phone })
  ask(w, 'key replacement', 'the new key\'s second block back to the old key\'s first', 'read_whole', [n2.hash, first.hash, 'held'], { whole: true, lacks: [] }, 'folds.md, A line: A key grant that puts a new key in an old key\'s place continues the old key\'s line from ... the key grant itself, when the old key signed it')
  void old, void move, void n1
}

// ---- 15. A not-read key grant (02-store vector 5) ----
{
  const w = new World('k2 a not-read key grant')
  const maria = w.person('maria')
  const tablet = fb.generateKeypair()
  const l = next(w, maria, maria.keys)
  const grant = w.add(signed(maria, maria.keys, 'grant', { kind: 'key', public_key_sign: tablet.public_key_sign, sparkle: 'new' }, { subject: maria.id }, { prev: l.prev, seq: l.seq }), 'a key grant with a field no list knows')
  const b = w.add(signed(maria, tablet, 'observe', { kind: 'note' }, {}, { prev: grant.hash, seq: 1, keyRef: grant.hash }), 'the tablet\'s block')
  ask(w, 'not-read key grant', 'the key grant is not read', 'read', [grant, 'held'], ['undeclared_field'], 'core.md 8, check 8', codes)
  ask(w, 'not-read key grant', 'the block its key signs is valid', 'valid', [b, 'held'], [], 'core.md 8, check 6: A key grant that is valid brings its key in for this check whether or not this reader can read it', codes)
  ask(w, 'not-read key grant', 'and does not speak for her', 'signed_by_author', [b, 'held'], false, 'core.md 8, check 6: one that is not read gives its key no voice in any fold')
}

// ---- 16. read's codes, in the order of refusals.read ----
{
  const w = new World('k2 read codes in order')
  const maria = w.person('maria')
  const l = next(w, maria, maria.keys)
  const p = w.add(signed(maria, maria.keys, 'promise', { what: 'loaves', terms: { quantity: 5 } }, { for: 'ab'.repeat(32) }, { prev: l.prev, seq: l.seq }), 'a promise for a block not held, whose terms.quantity is no amount')
  ask(w, 'read codes', 'valid: who said these bytes', 'valid', [p, 'held'], [], 'core.md 8: valid reads no other link and no schema', codes)
  ask(w, 'read codes', 'read gives every code, in the order of refusals.read', 'read', [p, 'held'], ['names_missing', 'shape'], 'core.md 8: It gives every code it finds, one per code, in the order of protocol.json (refusals.read), which lists every code it can give', codes)
}

// ---- 17. The short reply (stage 1) under the header signature ----
{
  const w = new World('k2 the short reply')
  const shop = w.person('shop'), mama = w.person('mama')
  const offer = w.w(shop, 'promise', { terms: { quantity: fb.amount('2', 'kg') } }, { what: shop.id, from: shop.id, to: mama.id }, 'the shop offers')
  const before = w.blocks.slice()
  const no = w.w(mama, 'observe', { status: 'declined' }, { answers: offer.hash, for: offer.hash }, 'mama declines by text')
  const text = call('short_reply', no)
  ask(w, 'short reply', 'the reply rebuilt from its text verifies under the header signature', 'short_reply_open', [text, mama.id, before], no.hash, 'core.md 2: A block is signed over its header (and stage 1, the short reply)', (b) => b && b.hash)
}

function report() {
  for (const q of questions) console.log(`${q.agrees ? '=' : 'DIFFERS'} | ${q.case} | ${q.question} | core ${JSON.stringify(q.core).slice(0, 180)}`)
  const n = questions.filter((q) => !q.agrees).length
  console.log(`\n${questions.length} questions, ${n} where the core differs from the text`)
}
if (require.main === module) report()
module.exports = { worlds: global.__worlds.filter((w) => w.name.startsWith('k2 ')), questions }
