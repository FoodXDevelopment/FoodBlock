'use strict';
// The oracle's part for messages between nodes (nodes.md; privacy.md; transport.md; profiles/short-form.md): the wire, the short reply, leaving, rule sets and mounts.
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Deals = require('./deals.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
// ================================================================ messages (privacy.md, nodes.md)
const withoutSignature = m => { const o = { ...m }; delete o.signature; return o; };
const signMessage = (m, privHex, suite) => ({ ...withoutSignature(m), signature: Bytes.signBytes(Buffer.from(Bytes.jcs(withoutSignature(m)), 'utf8'), privHex, suite) });
// A key signs four shapes, told apart by their top-level keys (core.md, section 2): a request has `signer` and `node`, an answer has `node` and neither `signer` nor `hash`; a header (`hash`)
// or a genesis (`type`) is no message. A verifier checks the key set before the signature.
const messageShape = m => (!Basics.isObj(m) ? null : 'signer' in m && 'node' in m ? 'request' : 'node' in m && !('signer' in m) && !('hash' in m) && !('type' in m) ? 'answer' : null);
// `verify_message` checks the key before the signature: a key spelled no suite's way opens nothing, and a header or a genesis is no message
const verifyMessage = (m, pubHex) => messageShape(m) !== null && Bytes.suiteOfKey(pubHex) !== null && Bytes.verifyBytes(Buffer.from(Bytes.jcs(withoutSignature(m)), 'utf8'), m.signature, pubHex);
// A signed request carries the signer, the node it is for, exactly one of counter or challenge (no time), and a signature.
function requestRefusals(m, o, fields) {
  const out = [];
  const keys = Check.asList(o.keys);
  // a signed request is exactly the keys protocol.json gives it: any other key is not a signed request of this signer
  if (!Basics.isObj(m) || Object.keys(m).some(k => !fields.includes(k))) out.push({ code: 'bad_signature', detail: 'a signed request carries only the keys of messages.signed_pull or signed_push' });
  if (!Basics.isStr(m.signature) || !keys.some(k => verifyMessage(m, k))) out.push({ code: 'bad_signature', detail: 'not signed by the signer it names' });
  if (m.node !== o.node) out.push({ code: 'wrong_node', detail: 'it names another node' });
  const hasC = m.counter !== undefined, hasCh = m.challenge !== undefined;
  const replay = (hasC === hasCh) || (hasC && !(Number.isSafeInteger(m.counter) && m.counter >= 0 && m.counter > (o.highest === undefined ? -1 : o.highest))) || (hasCh && !Check.asList(o.issued).includes(m.challenge));
  if (replay) out.push({ code: 'replay', detail: 'its counter is not above the highest seen, or its challenge was not issued or was used' });
  return out;
}
const pullRefusals = (m, o) => requestRefusals(m, o, Basics.C.messages.signed_pull), pushRefusals = (m, o) => requestRefusals(m, o, Basics.C.messages.signed_push);
const answerSignedBy = (a, pubHex) => verifyMessage(a, pubHex);
const pushAnswer = (fields, o) => signMessage({ ...withoutSignature(fields), node: o.node }, o.privateKey, o.suite || 'std');
const pushRequest = (messages, forWhom) => ({ messages, for: forWhom });
// the discovery document's shape (nodes.md, Discovery), one problem per line: the fields of messages.discovery and no other; `node` an id;
// `reads` the ids of the rule sets it runs; `log` (where it keeps one) an id; `admission` the hash of its admission block or null; `endpoints` exactly pull, push and challenge, each a URL or null.
// Its signature is checked as any signed message's (answer_signed_by), not here.
function wellKnownErrors(d) {
  if (!Basics.isObj(d) || d.protocol !== 'foodblock') return ['protocol is "foodblock"'];
  const disc = Basics.C.messages.discovery, eps = Basics.C.messages.endpoints, isId = v => Basics.isStr(v) && Check.RX.id.test(v);
  const out = Object.keys(d).filter(k => !disc.includes(k)).map(k => `${k} is not part of discovery (${disc.join(', ')})`);
  if (!isId(d.node)) out.push('node is the id of the node (an actor)');
  if (!(Array.isArray(d.reads) && d.reads.every(isId))) out.push('reads lists the ids of the rule sets the node runs');
  if (d.log !== undefined && !isId(d.log)) out.push('log is the id of the block that brought the log\'s key in');
  if (!(d.admission === null || isId(d.admission))) out.push('admission is the hash of the admission block');
  const e = d.endpoints;
  if (!(Basics.isObj(e) && Object.keys(e).every(k => eps.includes(k)) && eps.every(k => e[k] === null || (Basics.isStr(e[k]) && (e[k].startsWith('http://') || e[k].startsWith('https://')))))) out.push(`endpoints: { ${eps.join(', ')} } are URLs`);
  return out;
}
// the discovery document a node states (nodes.md, Discovery), unsigned: its signature is the node's, over these fields
function wellKnown(node, reads, admission, endpoints, log) {
  const doc = { protocol: 'foodblock', reads: [...new Set(Check.asList(reads))].sort(), node, admission: admission === undefined ? null : admission, endpoints: Object.fromEntries(Basics.C.messages.endpoints.map(k => [k, Basics.isObj(endpoints) && Basics.isStr(endpoints[k]) && endpoints[k] !== '' ? endpoints[k] : null])) };
  if (Basics.isStr(log)) doc.log = log;
  return doc;
}
// a local announcement (mDNS / DNS-SD or a short-range link): the fields of messages.announcement the document carries (`reads` where `version` was)
const announcement = d => Object.fromEntries(Basics.C.messages.announcement.filter(k => Basics.isObj(d) && d[k] !== undefined && d[k] !== null).map(k => [k, d[k]]));
// A sealed copy: open it, check the block inside (size limit), return what the recipient learns.
function openCopy(msg, privHex) {
  if (msg.version !== undefined) throw Bytes.cryptoError('a sealed copy carries no version', 'shape');
  const plain = Bytes.open(msg.envelope, privHex);
  if (plain.version !== undefined) throw Bytes.cryptoError('a plaintext carries no version', 'shape');
  // the plaintext is { block, reveals } and may carry `pad`, a string of spaces, which a reader ignores
  if ('pad' in plain && !(Basics.isStr(plain.pad) && /^ *$/.test(plain.pad))) throw Bytes.cryptoError('pad is a string of spaces', 'shape');
  const b = Check.blockOnly(plain.block);
  if (Buffer.byteLength(Bytes.canonical(b.type, b.state, b.refs), 'utf8') > Basics.P.limits.block_bytes) { const e = new Error('size_limit'); e.code = 'size_limit'; e.kind = 'refusal'; throw e; }
  const hash = Bytes.hashOfBlock(b, Check.suiteFromBlock(b));
  // the public header describes the body exactly (privacy.md): its hash, author, key, seq, prev and flags
  const h = msg.header;
  if (Basics.isObj(h) && (h.hash !== hash || h.author !== b.refs.author || h.seq !== b.state.seq || h.prev !== b.refs.prev || h.key !== b.refs.key || ['skip'].some(f => (h[f] === true) !== (b.state[f] === true)))) throw new Error('the header does not describe the block inside it');
  // the block's one signature is the header's (privacy.md, Sealed messages): the plaintext carries none
  return { block: plain.block, signature: msg.header_signature, reveals: plain.reveals, hash };
}
const headerSignedBy = (msg, pubHex) => Bytes.verifyBytes(Buffer.from(Bytes.jcs(msg.header), 'utf8'), msg.header_signature, pubHex);
// wrap / unwrap (core.md section 6): a public block as a message
// ---- answering a pull (nodes.md, Pull): the matches in arrival order, each with its arrival number on the log the answer names; a lie travels with its proof.
// `log` entries are { n, block, header?, header_signature?, copies? }: `n` is the arrival number of the block on the log the asker names (the `seq` of the first receipt on it that
// names the block, nodes.md, The arrival log). A block with no receipt on that log has no arrival number there and is not
// served under it (nodes.md, Messages): an entry with no whole n of at least 1 is never served, not even as a pair's proof.
function answerPull(log, request, node, privateKey, choices, asker, blocksIn, suite, through) {
  const { cap, serves_pairs: servesPairs } = choices;
  log = (log || []).filter(e => Basics.isObj(e) && Number.isInteger(e.n) && e.n >= 1);
  const since = Number(request.since) || 0;
  const limit = request.limit > 0 ? Math.min(request.limit, cap) : cap;
  asker = asker || request.signer;
  const nOf = e => (Number.isInteger(e.n) ? e.n : 0);
  const blocks = Array.isArray(blocksIn) ? Check.poolOf(blocksIn) : Check.poolOf(log.map(e => e.block));
  // a filter reads only what the asker may see: a public block whole, a non-public one whole only by an asker it has a copy for,
  // else its public header (author, prev, seq, hash) alone, so a private block given in the clear answers no filter on its content
  // a node shows a block's body only to an audience it can read: it holds the body, and every commitment of the audience is written in a hash name it knows; a body whose audience it
  // cannot read it shows to no one and passes on as its header. A sealed copy pushed for one person is passed to her as it came: it shows no body (a relay that holds only the copy passes it on)
  const seenBy = e => !Array.isArray(e.block.state.audience) || Boolean(asker && e.copies && e.copies[asker]);
  // an unsigned pull gets public blocks; a signed pull also gets each sealed block the node holds a copy of for the asker. Nothing of a sealed block goes to any
  // other asker, and for anyone else it matches no filter (no sealed header goes out)
  let found = log.filter(e => nOf(e) > since && seenBy(e) && Identity.matches(e.block, request.filter, blocks)).sort((a, b) => nOf(a) - nOf(b));
  if (request.heads === true) {
    const named = new Set(found.flatMap(e => [...Check.asList(e.block.refs.prev), ...Check.asList(e.block.refs.updates)]));
    found = found.filter(e => !named.has(e.block.hash));
  }
  const full = found.length >= limit;
  found = found.slice(0, limit);
  // an answer that is not full goes on from the last arrival the node read (`through`), so a window that matched nothing still moves on; a request that names in `seen` a
  // receipt on the log the node holds is answered by a node that read at least that far (nodes.md, Pull)
  const last = found.length ? nOf(found[found.length - 1]) : since;
  const seenEntry = Basics.isStr(request.seen) ? log.find(e => e.block.hash === request.seen) : undefined;
  const reach = Math.max(Number.isInteger(through) ? through : -Infinity, seenEntry ? nOf(seenEntry) : -Infinity);
  const next = Number.isFinite(reach) && !full ? Math.max(last, reach) : last;
  // a node that serves a pair's proof (its own choice) sends the other half of a pair (one key, one prev or one seq) with a block of it, matched or not, before since or after
  const have = new Set(found.map(e => e.block.hash)), proofs = [];
  if (servesPairs) {
    const pairs = Identity.forkPairs(blocks);
    for (const e of found) for (const p of pairs) if (p.includes(e.block.hash)) {
      const other = p.find(h => h !== e.block.hash), o = log.find(x => x.block.hash === other);
      // a sealed half goes only as the asker may see it: to one the node holds a copy for; nothing of it goes to any other asker (nodes.md)
      if (o && !have.has(other) && seenBy(o) && (o.block.type !== undefined || (asker && o.copies && o.copies[asker]))) { have.add(other); proofs.push(o); }
    }
  }
  found = found.concat(proofs).sort((a, b) => nOf(a) - nOf(b));
  const messageOf = e => {
    const a = e.block.state.audience;
    if (a === 'public' || !Array.isArray(a)) return wrap(e.block);
    const copy = asker && e.copies && e.copies[asker]; // a sealed copy is passed to the one it was pushed for, as it came
    if (copy) return copy;
    return { header: e.header || Identity.header(e.block), header_signature: e.header_signature !== undefined ? e.header_signature : e.block.signature }; // only the proofs of a pair reach here, never a sealed block to a stranger
  };
  // the answer names its log only when the request names one (nodes.md, Messages; protocol.json messages.pull_answer_optional)
  const answer = { node, request: Bytes.sha256(Bytes.jcs(request)), ...(Basics.isStr(request.log) ? { log: request.log } : {}), blocks: found.map(e => ({ n: nOf(e), message: messageOf(e) })), next };
  // signed by the node when a private key is given (protocol.json door.answer_pull: `signature` only then)
  return Basics.isStr(privateKey) ? signMessage(answer, privateKey, suite || 'std') : answer;
}
// the parts a caller gives (taken among them: protocol.json door.ops.push_answer) are sorted as push_answer_order says.
// a node's signed answer to a push (nodes.md, Messages): every key but `receipt` and `had` always present, an empty list [], in the order messages.push_answer_order gives
function buildPushAnswer(parts, node, privateKey, suite) {
  const p = Basics.isObj(parts) ? parts : {}, items = k => (Array.isArray(p[k]) ? p[k] : []), id = x => (Basics.isObj(x) && x.hash !== undefined ? x.hash : x);
  const byH = (a, b) => Basics.cmp(a.hash, b.hash);
  const answer = {
    node,
    taken: items('taken').map(id).sort(),
    unjudged: items('unjudged').map(u => ({ hash: u.hash, needs: [...Check.asList(u.needs)].sort() })).sort(byH),
    refused: items('refused').map(r => ({ hash: r.hash === undefined ? null : r.hash, code: r.code === undefined ? null : r.code, detail: r.detail === undefined ? null : r.detail })).sort((a, b) => Basics.cmp(String(a.hash), String(b.hash)) || Check.CODE_ORDER.indexOf(a.code) - Check.CODE_ORDER.indexOf(b.code)),
    unread: items('unread').map(u => ({ hash: u.hash, codes: [...Check.asList(u.codes)].sort((x, y) => Check.READ_ORDER.indexOf(x) - Check.READ_ORDER.indexOf(y)) })).sort(byH),
    equivocations: items('equivocations').map(q => [...Check.asList(q)].sort()).sort((a, b) => Basics.cmp(a.join(), b.join())),
  };
  if (Basics.isObj(p.receipt)) {
    // a receipt sealed to a pusher names only what that pusher's push added: one whose refs.derives_from names a block not in this answer's taken is refused
    const d = Basics.isObj(p.receipt.refs) ? p.receipt.refs.derives_from : undefined;
    if (d !== undefined && (Array.isArray(d) ? d : [d]).some(x => !answer.taken.includes(x))) throw Bytes.cryptoError('a receipt to a pusher names only what that pusher\'s push added (nodes.md)', 'shape');
    answer.receipt = p.receipt;
  }
  if (Array.isArray(p.had)) answer.had = [...new Set(p.had.map(id).filter(Basics.isStr))].sort();
  return signMessage(answer, privateKey, suite || 'std');
}
// ---- what a node's signed words alone show (nodes.md, The arrival log; door op log_shown): { left_out, stopped_short }. `receipts` are the blocks of one door log the asker holds,
// receipts and `dropped`, as whole blocks (a sealed receipt the asker has opened is { header, header_signature, block }; one still sealed shows nothing).
// log_shown (nodes.md, The arrival log): the receipts are whole blocks, valid with what is given and on the request's log (a receipt given as its header names nothing); the
// answer counts only when it names the request's hash and log and a key that speaks for its node signed it. A block matches the request's filter as the asker may see it: whole
// when public or hers, else by its header; one the checker does not hold, only a request with no filter. A dropped at or below next drops a block it names, or a block its
// receipt names, unless the door's person (the receipt's refs.subject) signed or answered it.
function logShown(receiptsIn, request, answer, blocksIn) {
  const none = { left_out: [], stopped_short: false };
  if (!Array.isArray(receiptsIn)) throw Bytes.argError('receipts is a list of whole blocks');
  if (!Basics.isObj(request) || !Basics.isObj(answer) || !Basics.isStr(request.log) || answer.log !== request.log || answer.request !== Bytes.sha256(Bytes.jcs(request))) return none;
  const blocksL = Check.blockList(blocksIn), pool = Check.poolOf(blocksL);
  if (!Identity.identityFold(answer.node, blocksL).keys.some(k => verifyMessage(answer, k))) return none;
  const given = receiptsIn.filter(x => Basics.isObj(x) && x.type !== undefined && Basics.isObj(x.state) && Basics.isObj(x.refs));
  const ctxHeld = [...blocksL, ...given];
  const blocks = given.filter(b => !Check.valid(b, ctxHeld).length);
  const onLog = blocks.filter(b => (b.refs.key !== undefined ? b.refs.key : b.refs.author) === request.log);
  const receipts = onLog.filter(b => b.type === 'observe' && b.state.kind === 'receipt' && Number.isInteger(b.state.seq)).sort((a, b) => a.state.seq - b.state.seq);
  const drops = onLog.filter(b => b.type === 'observe' && b.state.kind === 'dropped' && Number.isInteger(b.state.seq) && b.state.seq <= answer.next);
  const since = Number(request.since) || 0, next = answer.next;
  const shownIds = new Set(Check.asList(answer.blocks).map(e => (Basics.isObj(e) && Basics.isObj(e.message) ? (Basics.isObj(e.message.block) ? Check.idOf({ ...e.message.block, signature: e.message.signature }, blocks) : Basics.isObj(e.message.header) ? e.message.header.hash : null) : null)).filter(Boolean));
  const arrival = new Map(), receiptOf = new Map();
  for (const r of receipts) for (const h of Check.asList(r.refs.derives_from)) if (!arrival.has(h)) { arrival.set(h, r.state.seq); receiptOf.set(h, r); }
  const dropNames = new Set(drops.flatMap(d => Check.asList(d.refs.derives_from)));
  const empty = !Basics.isObj(request.filter) || !Object.keys(request.filter).length;
  const left_out = [];
  for (const [h, n] of arrival) {
    if (!(since < n && n <= next) || shownIds.has(h)) continue;
    const r = receiptOf.get(h), X = pool.get(h), who = r.refs.subject;
    const hers = !!X && (X.refs.author === who || pool.all().some(y => y.refs && y.refs.author === who && Check.asList(y.refs.answers).includes(h)));
    if ((dropNames.has(h) || dropNames.has(r.hash)) && !hers) continue;
    if (!X) { if (empty) left_out.push(h); continue; }
    const seenWhole = X.type !== undefined && (!Array.isArray(X.state.audience) || X.refs.author === request.signer);
    if (!Identity.matches(seenWhole ? X : Check.asHeader(X), request.filter, pool)) continue;
    left_out.push(h);
  }
  let stopped_short = false;
  if (Basics.isStr(request.seen)) { const r = receipts.find(x => x.hash === request.seen); stopped_short = !!r && next < r.state.seq && next === since; }
  return { left_out: left_out.sort(), stopped_short };
}
// a message is exactly { block, signature } (core.md, section 6): no suite beside it, so no label gives one signed block a second id
const wrap = b => ({ block: Check.blockOnly(b), signature: b.signature });
function unwrap(m, blocks) {
  // a message is exactly { block, signature }: any other key, a suite or a version too, refuses it (core.md, section 6; protocol.json messages.public_block)
  if (!Basics.isObj(m) || Object.keys(m).some(k => !Basics.C.messages.public_block.includes(k)) || !Basics.C.messages.public_block.every(k => k in m)) throw Bytes.cryptoError('a message is exactly { block, signature }', 'shape');
  const b = Check.blockOnly(m.block);
  return { hash: Check.idOf({ ...b, signature: m.signature }, blocks), ...b, signature: m.signature };
}


// profiles/tasks.md, Sensor conditions: the readings are the observes of the condition's kind that name the sensor in refs.from, with an
// amount in the condition's unit and an at not later than `now`. The window runs from `now` less `over` to `now`. It holds when a reading at or
// before the start exists (it gives the state at the start) and it, and every reading inside the window, keeps to the rule.
function readingConditionHolds(c, blocks, now) {
  if (!c || !Basics.isStr(c.reading) || !Basics.isStr(c.kind) || !Basics.isStr(c.op) || !Basics.isStr(c.over) || !c.value || !Basics.isStr(c.value.value)) return false;
  if (!Check.RX.duration.test(c.over)) return false;
  const start = Check.addDur(now, c.over, -1);
  if (start === null) return false;
  // a reading counts only if it speaks for the sensor: signed by the sensor itself, or speaking for the sensor's owner (the ownership fold of the
  // sensor thing), signed by a key of hers (authority.md, Who a block speaks for). A reading a tool signs under a grant speaks for the tool alone
  const pool = Check.poolOf(blocks || []);
  const sensorBlock = pool.get(c.reading);
  const owner = sensorBlock && sensorBlock.type === 'thing' ? Things.ownershipFold(sensorBlock, blocks || []).owner : null;
  const speaksForOwner = (who, r) => Basics.isStr(who) && Basics.isStr(owner) && (who === owner || Things.speakerOf(r, pool) === owner);
  const rs = (blocks || []).filter(b => b.type === 'observe' && b.state.kind === c.kind && [].concat(b.refs.from || []).includes(c.reading) && (b.refs.author === c.reading || speaksForOwner(b.refs.author, b))
    && b.state.amount && b.state.amount.unit === c.value.unit && Basics.isStr(b.state.amount.value) && Basics.isStr(b.state.at) && b.state.at <= now)
    .sort((x, y) => Basics.cmp(x.state.at, y.state.at));
  const keeps = r => { const k = Deals.decCmp(r.state.amount.value, c.value.value); return Basics.P.condition_ops.includes(c.op) && { lt: k < 0, le: k <= 0, gt: k > 0, ge: k >= 0, eq: k === 0 }[c.op] === true; };
  const before = rs.filter(r => r.state.at <= start);
  if (!before.length) return false;
  // the latest reading at or before the window's start; where several share that instant, every one must keep to the rule (tasks.md)
  const last = before[before.length - 1].state.at;
  return rs.filter(r => r.state.at >= last).every(keeps);
}

// ================================================================ the short reply (profiles/short-form.md, way 1)
// Her key signs her answer as any key signs a block. Only what the receiver cannot rebuild travels: `FB1 ` and base64url of the signature (64), the first 5 bytes of the
// id of the block answered, the answer (01 accepted, 02 declined), `at` (6 bytes, ms since 1970, big-endian; all zero when a decline carries none), `seq` (the rest, big-endian).
// The receiver takes each given block with that code, fills the answer template with the signer's id, the signer's head it holds, refs.key from her list it holds (none for
// her genesis key) and these values, and checks it: the block whose signature opens is the block. Returns { hash, block, answer, valid } or null when none opens.
// The short reply (profiles/short-form.md, way 1): the text of a signed accept or decline, `FB1 ` and base64url of the signature, the first 5 bytes of the id
// answered, the answer, `at` (6 bytes, all zero when a decline carries none) and `seq` (no leading zero); null for a block that is no such answer.
function shortReplyText(b) {
  const prof = Basics.C.profiles['short-form'].short_reply;
  if (!Basics.isObj(b) || !Basics.isObj(b.state) || !Basics.isObj(b.refs) || !Basics.isStr(b.signature) || !Basics.isStr(b.refs.answers)) return null;
  const code = Object.keys(prof.answers).find(k => prof.answers[k] === b.state.status);
  const seq = b.state.seq;
  if (!code || !Number.isInteger(seq) || seq < 0) return null;
  let ms = 0;
  if (Basics.isStr(b.state.at)) ms = Date.parse(b.state.at); else if (b.state.status !== 'declined') return null;
  const at = Buffer.alloc(6); at.writeUIntBE(ms, 0, 6);
  let seqHex = BigInt(seq).toString(16); if (seqHex.length % 2) seqHex = '0' + seqHex;
  const bytes = Buffer.concat([Buffer.from(b.signature, 'hex'), Buffer.from(b.refs.answers.replace(/^[a-z0-9-]+:/, ''), 'hex').subarray(0, 5), Buffer.from(code, 'hex'), at, Buffer.from(seqHex, 'hex')]);
  return prof.prefix + bytes.toString('base64url');
}
// A short reply rebuilt: for each given block whose id starts with the 5 bytes, the template is filled with the signer's id, the head of each key of hers given (or the
// block that brought the key in), `refs.key` the key grant that brought that key in (none for her genesis key), and the reply's values. An accept is a `promise`
// whose `for` is the block answered and whose `derives_from` is a list of one id, a `readback` `for` that block; a decline an `observe` with neither. The block whose
// signature opens is the block; null when none opens.
function shortReplyOpen(text, signerId, blocksIn) {
  const pool = Check.poolOf(blocksIn), prof = Basics.C.profiles['short-form'].short_reply;
  if (!Basics.isStr(text) || !text.startsWith(prof.prefix)) return null;
  // a short reply opens only from its exact spelling: strict base64url, no padding, `seq` in its fewest bytes
  const body = text.slice(prof.prefix.length);
  if (!/^[A-Za-z0-9_-]*$/.test(body)) return null;
  const raw = Buffer.from(body, 'base64url');
  if (raw.toString('base64url') !== body) return null;
  if (raw.length < 77 || (raw.length > 77 && raw[76] === 0)) return null;
  const sig = raw.subarray(0, 64).toString('hex'), code = raw.subarray(64, 69).toString('hex'), status = prof.answers[raw.subarray(69, 70).toString('hex')], ms = raw.readUIntBE(70, 6), seq = Number(BigInt('0x' + raw.subarray(76).toString('hex')));
  if (!status) return null;
  const root = pool.get(signerId);
  if (!Check.soundGenesis(root)) return null;
  const options = [{ key: root.state.public_key_sign, suite: root.state.suite || 'std', kg: null, bringer: root }];
  for (const kg of pool.all()) if (Check.keyGrantOf(kg, signerId)) for (const k of Check.keysBroughtBy(kg, signerId)) options.push({ key: k.key, suite: k.suite, kg, bringer: kg });
  for (const cand of pool.all()) {
    if (cand.hash.replace(/^[a-z0-9-]+:/, '').slice(0, 10) !== code) continue;
    const rbs = status === 'accepted' ? pool.all().filter(x => x.type === 'observe' && x.state.kind === 'readback' && Check.asList(x.refs.for).includes(cand.hash)) : [null];
    for (const o of options) {
      const mine = pool.all().filter(x => x.refs.author === signerId && x.hash !== signerId && Number.isInteger(x.state.seq) && x.state.seq < seq && (() => { const s = Check.signerFrom(x, pool); return !!s && s.key === o.key; })()).sort((a, b) => b.state.seq - a.state.seq);
      const head = mine[0] || o.bringer;
      for (const rb of rbs) {
        const refs = { answers: cand.hash, author: signerId, for: cand.hash, prev: head.hash, ...(o.kg ? { key: o.kg.hash } : {}), ...(rb ? { derives_from: [rb.hash] } : {}) };
        const state = { audience: 'public', seq, status, ...(ms !== 0 || status === 'accepted' ? { at: new Date(ms).toISOString() } : {}) };
        const block = { type: status === 'accepted' ? 'promise' : 'observe', state, refs };
        if (Bytes.verifyBlock(block, sig, o.key, o.suite)) return { hash: Bytes.hashOfBlock(block, o.suite), ...block, signature: sig };
      }
    }
  }
  return null;
}
// ================================================================ leaving (nodes.md, A host: Her record at a host)
// exportOf(person, blocks, logId) (the oracle's own builder; the door op is export_whole, below): her record at a host as { format, messages }: every block her door log names, every block she signed that the host holds, each one's pieces, the
// lines each one's answers read, from the block back to the fold's own start and no further (nodes.md, Her record at a host; folds.md, What is left), and the door log. A block another author sealed goes as its header.
// The folds that read a line of a block are asked of every block in it (the ownership of an instance, a first promise's stage and its pot), and the blocks their lines run through go with it.
const logIdOf = b => (b.refs.key !== undefined ? b.refs.key : b.refs.author);
// "each answer a fold gives of a block in it" (nodes.md): the folds asked of every block in the document are the ownership of an instance and, of a first promise, its stage and its pot; the
// blocks their lines run through (each from the block back to the fold's own start) go in the export. Stages 4 to 6 add the folds they name.
function foldsRead(pool, ofBlocks) {
  const walked = new Set();
  Things.WALKED = walked; pool.forget();
  try {
    for (const b of ofBlocks) {
      if (b.type === undefined) continue;
      if (Things.isInstance(b)) Things.ownershipFold(b, pool);
      if (b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined) { Deals.promiseStage(b, pool); Deals.potFold(b, pool, ''); }
    }
  } finally { Things.WALKED = null; pool.forget(); }
  return walked;
}
function exportOf(person, blocksIn, logId) {
  const pool = Check.poolOf(blocksIn), want = new Map();
  const add = b => { if (b && !want.has(b.hash)) want.set(b.hash, b); };
  const onLog = pool.all().filter(b => b.type !== undefined && logIdOf(b) === logId);
  for (const b of onLog) { add(b); for (const h of Check.asList(b.refs.derives_from)) add(pool.get(h)); }
  for (const b of pool.all()) if (b.refs && b.refs.author === person) add(b);
  const idx = Check.buildIdx(pool.all());
  for (const b of [...want.values()]) for (const h of Check.piecesOf(b, idx).have) add(pool.get(h));
  for (const h of foldsRead(pool, [...want.values()])) add(pool.get(h));
  for (const b of [...want.values()]) for (const h of Check.piecesOf(b, idx).have) add(pool.get(h));
  const messages = [...want.values()].sort(Basics.byHash).map(b => (b.type !== undefined ? wrap(b) : { header: Identity.header(b), header_signature: b.header_signature }));
  return { format: 'application/foodblock+json', messages };
}
// export_whole(doc, log, last): whether an export is whole (nodes.md, A host, Her record at a host; protocol.json door.ops.export_whole), as { whole, lacks }. The receipts come
// opened. lacks, each once, ids ascending then { author, key, seq } by author, key (null first), seq: what the door log lacks from `last` back to the block that brought its key
// in; each block a receipt on the log names that is not in it, unless a dropped on the log names it or its receipt; each piece of a block in it that is not in it; each block
// a receipt names that is not in it and that the line of a block in it lacks, read back to where the line begins.
function foldLacks(pool) {
  const out = [];
  pool.forget();
  for (const b of pool.all()) {
    if (b.type === undefined) continue;
    const rs = [];
    if (Things.isInstance(b)) rs.push(Things.ownershipFold(b, pool));
    if (b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined) { rs.push(Deals.promiseStage(b, pool)); rs.push(Deals.potFold(b, pool, '')); }
    for (const r of rs) if (r && r.not_shown) out.push(...r.lacks);
  }
  return out;
}
function exportWhole(doc, logId, last) {
  if (!Basics.isObj(doc) || !Array.isArray(doc.messages) || !Basics.isStr(logId) || !Basics.isStr(last)) throw Bytes.argError('export_whole takes { format, messages }, a log id and the receipt she holds');
  const raw = doc.messages.filter(m => Basics.isObj(m) && Basics.isObj(m.block)).map(m => ({ ...Check.blockOnly(m.block), signature: m.signature }));
  const entries = Check.normEntries([...raw.map(b => ({ ...b, hash: Check.idOf(b, raw) })), ...doc.messages.filter(m => Basics.isObj(m) && Basics.isObj(m.header) && m.block === undefined)]);
  const all = new Map(entries.map(e => [e.hash, e])), pool = new Check.Pool(entries), lacks = [];
  const onLog = e => e.type !== undefined && (Check.keyRefOf(e) !== undefined ? Check.keyRefOf(e) : e.refs.author) === logId;
  const kind = (e, k) => e.type === 'observe' && Basics.isObj(e.state) && e.state.kind === k;
  const lastE = all.get(last);
  if (!lastE) lacks.push(last);
  else {
    if (!onLog(lastE)) throw Bytes.argError('the block she holds is a block on the log');
    const r = Identity.walkLine(pool, last, logId);
    if (!r.reached && !r.lacks.length) throw Bytes.argError('the block she holds is not on the log\'s line');
    lacks.push(...r.lacks);
  }
  const onLogAll = [...all.values()].filter(onLog);
  const receipts = onLogAll.filter(e => kind(e, 'receipt')), drops = onLogAll.filter(e => kind(e, 'dropped'));
  const dropped = new Set(drops.flatMap(d => Check.asList(d.refs.derives_from)));
  const named = new Set(receipts.flatMap(r => Check.asList(r.refs.derives_from)));
  for (const r of receipts) for (const h of Check.asList(r.refs.derives_from)) if (!all.has(h) && !dropped.has(h) && !dropped.has(r.hash)) lacks.push(h);
  for (const e of all.values()) for (const p of [e.refs && e.refs.author, Check.keyRefOf(e)]) if (Basics.isStr(p) && !all.has(p)) lacks.push(p);
  // each fold asked of a block in it: its line, from that block back to the fold's own start and no further (nodes.md, Her record at a host): an answer it cannot give for want of a block a receipt names
  for (const x of foldLacks(pool)) if (Basics.isStr(x) && named.has(x) && !all.has(x)) lacks.push(x);
  const ids = [...new Set(lacks.filter(Basics.isStr))].sort();
  const seen = new Set(), nums = lacks.filter(x => !Basics.isStr(x)).filter(x => { const k = Bytes.jcs(x); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Basics.cmp(a.author, b.author) || (a.key === b.key ? 0 : a.key === null ? -1 : b.key === null ? 1 : Basics.cmp(a.key, b.key)) || a.seq - b.seq);
  return { whole: ids.length + nums.length === 0, lacks: [...ids, ...nums] };
}

// ================================================================ rule sets, a wrapped copy, a kept copy, a receipt, mounts
// ---- rule sets by hash (core.md, section 11): the SHA-256 of the canonical bytes of the manifest { files: { path: SHA-256 of the file's bytes } }. A library tool: the name is a fact anyone computes.
function ruleSet(files) {
  if (!Basics.isObj(files)) throw Bytes.argError('files is { <path under spec/>: <the file\'s bytes as text> }');
  const out = {};
  for (const path of Object.keys(files).sort(Basics.byBytes)) {
    if (!Basics.isStr(files[path]) && !Buffer.isBuffer(files[path])) throw Bytes.argError('the bytes of ' + path + ' are text');
    out[path] = Bytes.sha256(Buffer.isBuffer(files[path]) ? files[path] : Buffer.from(files[path], 'utf8'));
  }
  const manifest = { files: out };
  return { id: Bytes.sha256(Buffer.from(Bytes.jcs(manifest), 'utf8')), manifest };
}
// the id of the rule set this build is made from: the id of the manifest published beside the spec (`spec/rule-set.json`), or null where the build was given none
function buildRuleSet() {
  try { const m = JSON.parse(require('fs').readFileSync(Basics.SPEC + 'rule-set.json', 'utf8')); return Basics.isObj(m) && Basics.isObj(m.files) ? Bytes.sha256(Buffer.from(Bytes.jcs(m), 'utf8')) : null; } catch { return null; }
}
// ---- a wrapped copy (privacy.md, Keeping apart): a copy wrapped in an envelope of its own to a key the reader gave the sender, a mailbox. { mailbox, envelope }, the envelope being the sealed
// plaintext { copy, pad } padded to the sizes of Sealed messages; the mailbox is the key's public encryption key, as the reader gave it. A host that keeps it learns { mailbox, bytes } (and when, by its own clock) (the text does not say; read so).
function wrapCopy(copy, mailboxPub, suite) {
  if (!Basics.isObj(copy) || !Basics.isStr(mailboxPub)) throw Bytes.argError('a wrapped copy is a sealed copy and a mailbox key');
  return { mailbox: mailboxPub, envelope: Bytes.seal({ copy }, [mailboxPub], suite, { pad: true }) };
}
function unwrapCopy(w, mailboxPriv) {
  if (!Basics.isObj(w) || !Basics.isObj(w.envelope) || !Basics.isStr(w.mailbox) || Object.keys(w).some(k => k !== 'mailbox' && k !== 'envelope')) throw Bytes.cryptoError('a wrapped copy is exactly { mailbox, envelope }', 'shape');
  const plain = Bytes.open(w.envelope, mailboxPriv);
  if (!Basics.isObj(plain) || !Basics.isObj(plain.copy) || ('pad' in plain && !(Basics.isStr(plain.pad) && /^ *$/.test(plain.pad)))) throw Bytes.cryptoError('a wrapped copy holds a sealed copy and spaces', 'shape');
  return plain.copy;
}
// what a host holds of a wrapped copy: which mailbox, how big after padding (the envelope's ciphertext bytes, tag included), and when it came
const wrappedSeen = w => ({ mailbox: w.mailbox, bytes: Buffer.from(w.envelope.ciphertext, 'base64').length }); // the host's clock is its own: no `at`
// ---- a receipt to a pusher (nodes.md, Push): it names only what that pusher's push added. `taken` is the list of ids one push added; a door log's receipt is an observe of kind `receipt` naming them in `derives_from`
const receiptFor = taken => ({ type: 'observe', state: { kind: 'receipt' }, refs: { derives_from: [...new Set(Check.asList(taken))].sort() } });
// ---- a mount (core.md, section 12): a caller's handle on the door's memory. 32 lowercase hex characters naming, for this door only, the set of blocks given so far; nothing is ever taken out of it; it means nothing and
// is no part of any answer. An op that takes `blocks` takes a mount in its place and answers as it does for the mount's set given as an array.
const MOUNTS = new Map(), GONE = new Set();
const isMountId = x => Basics.isStr(x) && /^[0-9a-f]{32}$/.test(x);
function mountOp(blocks, into) {
  if (!Array.isArray(blocks)) throw Bytes.argError('blocks is a list');
  let id = into, set;
  if (into !== undefined && into !== null) { if (!MOUNTS.has(into)) throw Bytes.argError('unknown_mount'); set = MOUNTS.get(into); } else { do { id = Basics.crypto.randomBytes(16).toString('hex'); } while (MOUNTS.has(id) || GONE.has(id)); set = new Map(); MOUNTS.set(id, set); }
  for (const b of blocks) set.set(Basics.isObj(b) && Basics.isStr(b.hash) ? b.hash : Basics.isObj(b) && Basics.isObj(b.header) ? 'h:' + b.header.hash + ':' + Bytes.jcs(b) : 'x:' + Bytes.jcs(b), b);
  return id;
}
// an argument that is a mount is the mount's set; a mount forgotten is an argument error. A 32-hex text that never was a mount is read as it is.
function mountArgs(a) {
  return a.map(x => { if (!isMountId(x)) return x; if (MOUNTS.has(x)) return [...MOUNTS.get(x).values()]; if (GONE.has(x)) throw Bytes.argError('unknown_mount'); return x; });
}
function publicKeyOf(priv, suite) {
  if (!Basics.isStr(priv)) throw Bytes.argError('private_key is hex');
  if (Bytes.suiteOf(suite) === 'std' && priv.length !== 64) return Basics.crypto.createPublicKey(Basics.crypto.createPrivateKey({ key: Buffer.from(priv, 'hex'), format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).toString('hex');
  return Bytes.keypair(priv, suite).public_key_sign;
}
Object.assign(module.exports, { withoutSignature, signMessage, verifyMessage, requestRefusals, pullRefusals, pushRefusals, answerSignedBy, pushAnswer, pushRequest, wellKnownErrors, wellKnown, announcement, openCopy, headerSignedBy, answerPull, buildPushAnswer, logShown, wrap, unwrap, readingConditionHolds, shortReplyText, shortReplyOpen, exportOf, exportWhole, ruleSet, buildRuleSet, wrapCopy, unwrapCopy, wrappedSeen, receiptFor, MOUNTS, GONE, isMountId, mountOp, mountArgs, publicKeyOf });
