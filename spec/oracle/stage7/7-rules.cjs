// Stage 7, Jobs B, D, F and the lock (changes-1.9/07-last.md): rule sets by hash, discovery, the ops of the cut, the machine lock, the mount.
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const L = require('../core-set-a/lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, codes, sha, mkKey, day, J } = L;
const SPEC = path.join(__dirname, '..', '..');
// ---------------------------------------------------------------- B1: a rule set is named by its hash: the SHA-256, lowercase hex, of the canonical bytes of its manifest
{
  const files = {};
  const add = rel => { files[rel] = fs.readFileSync(path.join(SPEC, rel), 'utf8'); };
  add('core.md'); add('canonical.md'); for (const f of fs.readdirSync(path.join(SPEC, 'modules')).sort()) if (f !== 'nodes.md' && f.endsWith('.md')) add('modules/' + f); add('protocol.json'); add('vectors.json');
  const r = fb.door('rule_set', files);
  // independent: canonical bytes of { files: { path: sha256 } }, members in byte order, no spaces
  const manifest = '{"files":{' + Object.keys(files).sort().map(k => JSON.stringify(k) + ':"' + crypto.createHash('sha256').update(files[k], 'utf8').digest('hex') + '"').join(',') + '}}';
  const id = crypto.createHash('sha256').update(manifest, 'utf8').digest('hex');
  check('B1', 'rule_set over the spec files: the id is the SHA-256 of the manifest\'s canonical bytes', [r.id, Object.keys(r.manifest)], [id, ['files']]);
  check('B1', 'the manifest names exactly the paths given (core.md, canonical.md, modules but nodes.md, protocol.json, vectors.json)', Object.keys(r.manifest.files).includes('modules/nodes.md') || Object.keys(r.manifest.files).length, Object.keys(files).length);
  const changed = fb.door('rule_set', { ...files, 'core.md': files['core.md'] + ' ' });
  check('B1', 'one byte added to core.md gives another id', changed.id !== r.id, true);
  check('B1', 'no continues, no sound in the manifest', [('continues' in r.manifest), ('sound' in r.manifest)], [false, false]);
  const sp = fb.door('spec');
  check('B5', 'spec gains rule_set: null where the build was given no manifest', [Object.keys(sp).sort(), sp.rule_set], [['conventions', 'protocol', 'rule_set'], null]);
}
// ---------------------------------------------------------------- 3a-13 and B5: a block that states a rule set is read only by a reader that runs it (`runs`)
{
  const w = new World(), sam = P(w, 'sam'), ben = P(w, 'ben');
  const set = crypto.createHash('sha256').update('a rule set').digest('hex'), other = crypto.createHash('sha256').update('another').digest('hex');
  const K = kindOf(sam, 'crate'), C1 = instance(sam, K, { pack: A('1', 'crate') });
  const S1 = T(sam.write('promise', { terms: { quantity: A('1', 'crate') }, rule_set: set }, { from: sam.id, to: ben.id, what: C1.hash }), 'S1');
  check('B5', 'read of a block that states a set: unknown_rules with no runs (the core runs none)', codes(fb.door('read', S1, w.blocks)), ['unknown_rules']);
  check('B5', 'read with runs naming that set: read by the core\'s rules', codes(fb.door('read', S1, w.blocks, null, [set])), []);
  check('B5', 'read with runs naming another set: unknown_rules', codes(fb.door('read', S1, w.blocks, null, [other])), ['unknown_rules']);
  check('B5', 'runs null: none, the core alone', codes(fb.door('read', S1, w.blocks, null, null)), ['unknown_rules']);
  let err = null; try { fb.door('read', S1, w.blocks, null, ['nope']); } catch (e) { err = e.message ? 'argument error' : 'x'; }
  check('B5', 'runs that is no list of ids is an argument error', err, 'argument error');
}
// ---------------------------------------------------------------- B2: discovery states `reads`; no version, no sound, no speaks_for
{
  // (stage 7 compare: the shape checks and words are the core's; the signature is checked as any signed message's, not here)
  const node = sha('node'), set = sha('a rule set');
  const d = fb.wellKnown(node, [set], null, { pull: 'https://n.example/pull', push: 'https://n.example/push', challenge: 'https://n.example/c' });
  check('B2', 'the document a node states: protocol, reads, node, admission, endpoints; no version, no sound, no speaks_for', [Object.keys(d).sort(), d.reads], [['admission', 'endpoints', 'node', 'protocol', 'reads'], [set]]);
  check('B2', 'a discovery document with reads, no version, no sound: well formed', fb.wellKnownErrors(d), []);
  check('B2', 'signed, it is still well formed (signature is a field of discovery)', fb.wellKnownErrors({ ...d, signature: 'zz' }), []);
  const noReads = { ...d }; delete noReads.reads;
  check('B2', 'one without reads is not well formed', fb.wellKnownErrors(noReads), ['reads lists the ids of the rule sets the node runs']);
  check('B2', 'one that carries version or sound is not well formed: neither is part of discovery', fb.wellKnownErrors({ ...d, version: '1.8', sound: set }).length, 2);
  check('B2', 'the field list of the document: protocol, reads, node, admission, endpoints, log, signature', fb.C.messages.discovery, ['protocol', 'reads', 'node', 'admission', 'endpoints', 'log', 'signature']);
  check('B2', 'the local announcement names reads, not version', Object.keys(fb.announcement(d)).sort(), ['endpoints', 'node', 'protocol', 'reads']);
  check('B2', 'the mDNS TXT record names no version', fb.C.local_discovery.txt.includes('version'), false);
}
// ---------------------------------------------------------------- D1, D2: what a builder implements: 7 sound ops and 30 word ops; every one is answered; the removed ops are gone
{
  const prot = fb.P.door.protocol;
  check('D2', 'the sound part is 7 ops and the word ops 30', [prot.sound.length, prot.word.length], [7, 30]);
  check('D2', 'the sound part: hash, id_of, header, strict_text, verify, suite_of_key, valid', prot.sound, ['hash', 'id_of', 'header', 'strict_text', 'verify', 'suite_of_key', 'valid']);
  const missing = [...prot.sound, ...prot.word].filter(op => { try { fb.door(op); } catch (e) { return /the oracle has no op/.test(e.message); } return false; });
  check('D2', 'every one of the 37 protocol ops is answered by the oracle', missing, []);
  const gone = ['operators_of', 'owed_back', 'bids_shown', 'earnest_shape_ok', 'earnest_paid', 'within_limit', 'limit_commitment', 'limit_opens', 'limit_within_parent', 'limit_fence', 'may_act_as', 'ownership_view_clock'].filter(op => { try { fb.door(op); return false; } catch (e) { return !/the oracle has no op/.test(e.message); } });
  check('D2', 'ops the 1.9 stages delete are gone, not hidden (the oracle has no such op)', gone, []);
  check('D2', 'add_duration leaves the protocol ops but stays a library tool', [prot.sound.concat(prot.word).includes('add_duration'), fb.door('add_duration', '2026-11-01T00:00:00.000Z', 'P1D')], [false, '2026-11-02T00:00:00.000Z']);
  check('D2', 'identity_state is a protocol (word) op', prot.word.includes('identity_state'), true);
  const hasDoc = fb.P.door.ops; check('D2', 'each protocol op has an entry in protocol.json door.ops', [...prot.sound, ...prot.word].filter(o => !(o in hasDoc)), []);
}
// ---------------------------------------------------------------- D6 / 1.8 C6: the machine lock is a stop of the machine: { locked, locks, claimed }
{
  const w = new World(), sam = P(w, 'sam'), leila = P(w, 'leila'), pump = P(w, 'pump');
  const K = kindOf(sam, 'roller'), M = T(instance(sam, K, { pack: A('1', 'roller') }), 'M');
  const strangers = Array.from({ length: 20 }, (_, i) => P(w, 'free' + i));
  const claims = strangers.map(s => s.write('grant', { kind: 'stop', scope: { types: ['promise'] } }, { subject: M.hash }));
  const r0 = fb.door('machine_lock', M, w.blocks);
  check('lock', 'twenty free keys lock Sam\'s roller: locked false, claimed 20', [r0.locked, r0.locks.length, r0.claimed.length], [false, 0, 20]);
  // Sam's own stop is the owner's word
  const sams = T(sam.write('grant', { kind: 'stop', scope: { types: ['promise'] } }, { subject: M.hash }), 'SAMS');
  const r1 = fb.door('machine_lock', M, w.blocks);
  check('lock', 'Sam\'s own stop of his roller locks it; the others stay claimed', [r1.locked, r1.locks.map(tg), r1.claimed.length], [true, ['SAMS'], 20]);
  // its author's stop ends it
  const ends = sam.write('grant', { status: 'stopped', stop: 'onward' }, { updates: sams.hash });
  const r2 = fb.door('machine_lock', M, w.blocks);
  check('lock', 'Sam\'s stop of his own lock ends it: not locked', [r2.locked, r2.locks, r2.claimed.length], [false, [], 20]);
  check('lock', 'the answer has locked, locks, claimed and no lifted', Object.keys(r2).sort(), ['claimed', 'locked', 'locks']);
  // the fields how, placer, safe are no fields; the status lifted is no status
  const bad = sam.make('grant', { kind: 'stop', how: 'hand', placer: sam.id, safe: 'off' }, { subject: M.hash }, { keep: true });
  check('lock', 'how, placer and safe are undeclared fields of a stop', codes(fb.door('write_refusals', { type: bad.type, state: bad.state, refs: bad.refs }, w.blocks)).filter(c => c === 'undeclared_field').length >= 1, true);
  const lift = sam.make('grant', { status: 'lifted', stop: 'onward' }, { updates: sams.hash }, { keep: true });
  check('lock', 'lifted is no status', codes(fb.door('write_refusals', { type: lift.type, state: lift.state, refs: lift.refs }, w.blocks)).length > 0, true);
}
// ---------------------------------------------------------------- Job F: a mount is a caller's handle on the door's memory; it changes no answer
{
  const w = new World(), sam = P(w, 'sam'), ben = P(w, 'ben');
  const K = kindOf(sam, 'crate'), C1 = instance(sam, K, { pack: A('1', 'crate') });
  const d = deal(sam, C1, ben, A('1', 'crate')); const sale = sell(sam, C1, ben, d, A('1', 'crate'));
  const m = fb.door('mount', w.blocks);
  check('F', 'a mount is 32 lowercase hex characters', /^[0-9a-f]{32}$/.test(m), true);
  check('F', 'union: mount A, then `into` with B: every op over A and B as given', [J(fb.door('ownership', C1, m)) === J(fb.door('ownership', C1, w.blocks)), fb.door('mount', [sale], m) === m], [true, true]);
  // late piece: a block mounted before its key grant is unjudged; after the key grant is added, valid is []
  const w2 = new World(), amara = P(w2, 'amara'); const tk = mkKey('amara-tablet');
  const K1 = amara.write('grant', { kind: 'key', voices: [{ key: amara.key.pub }, { key: tk.pub, wait: 'PT0S' }] }, { subject: amara.id, updates: amara.id });
  const c1 = amara.write('observe', { kind: 'confirm' }, { confirms: K1.hash });
  const T1 = amara.asKey(tk, K1.hash, K1.hash);
  const note = T1.write('observe', { kind: 'note', text: 'hello' }, { after: [c1.hash] });
  const m2 = fb.door('mount', [w2.blocks[0], note]);
  const before = fb.door('valid', note, m2).map(x => x.code);
  fb.door('mount', [K1, c1], m2);
  check('F', 'late piece: before the key grant is added the note is unmet; after, valid is []', [before.length > 0, fb.door('valid', note, m2)], [true, []]);
  // late schema: a block not read for want of its schema reads once the schema is added
  const w3 = new World(), kofi = P(w3, 'kofi');
  const sch = kofi.write('thing', { kind: 'schema', name: 'recall', fields: { recalled_from: 'time!' } });
  const rec = kofi.write('promise', { terms: { quantity: A('1', 'crate') }, recalled_from: '2026-11-02T00:00:00.000Z' }, { from: kofi.id, to: w3.blocks[0].hash === kofi.id ? kofi.id : kofi.id, what: kindOf(kofi, 'crate').hash, schema: sch.hash });
  const m3 = fb.door('mount', [w3.blocks[0], rec, ...w3.blocks.filter(b => b.type === 'thing' && b.state.name === 'crate')]);
  const r_before = codes(fb.door('read', rec, m3));
  fb.door('mount', [sch], m3);
  check('F', 'late schema: not read for want of the schema; read once it is added', [r_before.length > 0, codes(fb.door('read', rec, m3))], [true, []]);
  // forgotten
  fb.door('unmount', m3);
  let err = null; try { fb.door('read', rec, m3); } catch (e) { err = /unknown_mount/.test(e.message) ? 'unknown_mount' : e.message; }
  check('F', 'forgotten: any later op naming it is an argument error (unknown_mount)', err, 'unknown_mount');
  check('F', 'a block given twice is one', (() => { const mm = fb.door('mount', [note, note]); const a = fb.door('mount', [note], mm); return a === mm; })(), true);
}
done();
