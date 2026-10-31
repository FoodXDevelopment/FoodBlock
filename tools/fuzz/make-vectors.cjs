#!/usr/bin/env node
'use strict';
// Writes spec/fuzz-vectors.json: the minimal reproducers of what the differential fuzzer and the world simulator found.
// Every block is made and signed by the spec-only oracle (spec/oracle/fb.cjs), never by the Rust core. The vectors are run by
// tools/fuzz/run-vectors.cjs (the oracle and the Rust core, both) and by sdk/rust/tests/fuzz_vectors.rs (the core alone).
const fs = require('fs'), path = require('path');
const fb = require('../../spec/oracle/fb.cjs');
const { World, rng, kindOf } = require('./world.cjs');

const out = [];
const add = (name, op, args, expect, extra = {}) => out.push({ name, op, args, expect, ...extra });
const strip = b => b; // blocks are kept whole: hash, type, state, refs, signature (and suite when it is not std)

// -- a small cast
const mk = (seed, suites = ['std', 'std', 'std']) => {
  const w = new World(rng(seed));
  const people = suites.map((s, i) => (i === 0 ? w.withRecovery() : w.newActor('person', s)));
  return { w, people, all: () => w.blocks };
};

// 1. A block with no `type` is not canonical (core.md 8.1), whatever else is wrong with it.
{
  const { w, people } = mk(1);
  const b = w.post(people[0], 'observe', { kind: 'note', text: 'x' });
  const body = { hash: b.hash, state: b.state, refs: b.refs, signature: b.signature };
  add('a block with no type is not canonical (not type_name)', 'valid', [body, w.blocks.filter(x => x !== b)], ['not_canonical'], { by: 'first_code' });
}
// 2. refs.author is one id, never a set.
{
  const { w, people } = mk(2);
  const b = w.post(people[0], 'observe', { kind: 'note', text: 'x' });
  const bad = { ...b, refs: { ...b.refs, author: [people[0].id] } };
  add('refs.author as a set is a grammar error, not a block that passes unchecked', 'valid', [bad, w.blocks.filter(x => x !== b)], ['grammar'], { by: 'first_code' });
}
// 3. state.kind is a label (text), in a genesis too.
{
  const w = new World(rng(3));
  const a = fb.keypair(w.r.hex(64), 'std');
  const state = { kind: { x: 'person' }, at: '2026-10-15T09:00:00.000Z', audience: 'public', public_key_sign: a.public_key_sign };
  const body = { type: 'actor', state, refs: {} };
  const g = { hash: fb.hashOfBlock(body, 'std'), ...body, signature: fb.signBlock(body, a.private_key, 'std') };
  add('a genesis whose kind is an object is refused', 'valid', [g, []], ['bad_genesis'], { by: 'first_code' });
}
// 4/5. Only a side answers a deal; only the author stops an open offer.
{
  const { w, people } = mk(4, ['std', 'std', 'std', 'std']);
  const [s, buyer, thief, stranger] = people;
  const thing = w.post(s, 'thing', { kind: 'eggs', name: 'Eggs' }, { of: kindOf('eggs') }); // an instance, as the generators write one (things.md)
  const offer = w.post(s, 'promise', { terms: { price: { minor: 100, currency: 'GBP' }, quantity: { value: '6', unit: '{egg}' }, expires: '2026-10-20T00:00:00.000Z' } }, { from: s.id, to: buyer.id, what: thing.hash });
  const held = w.blocks.slice();
  const steal = w.post(thief, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, after: [offer.hash] });
  // whether the signer is a side is the fold's (clean round 2: a side may name a thing whose owner the check cannot know): the accept is
  // valid, and binds nothing
  add('an accept by someone who is not a side of the deal is valid: the bytes are sound (clean round 2)', 'valid', [steal, held], [], { by: 'first_code' });
  add('and it binds nothing: the offer stays offered', 'promise_stage', [offer, [...held, steal], {}], { stage: 'offered' }, { by: 'subset' });
  const open = w.post(s, 'promise', { terms: { price: { minor: 100, currency: 'GBP' }, quantity: { value: '6', unit: '{egg}' }, expires: '2026-10-20T00:00:00.000Z' } }, { from: s.id, what: thing.hash });
  const held2 = w.blocks.slice();
  // the stop is signed by someone whose chain holds no refused block: a fold and a node read only blocks that pass the check (folds.md),
  // so a chain that rests on the thief's refused accept is unmet, whatever else is wrong with it
  const stop = w.post(stranger, 'promise', { status: 'stopped', stop: 'before' }, { updates: open.hash, for: open.hash, after: [open.hash] });
  add('a stop of an open offer by anyone but its author is valid (clean round 2): it counts for nothing in the fold', 'valid', [stop, held2], [], { by: 'first_code' });
  add('the stranger\'s stop does not stop the offer in the fold', 'promise_stage', [open, [...held2, stop], {}], { stage: 'offered' }, { by: 'subset' });
  const good = w.post(s, 'promise', { status: 'stopped', stop: 'before' }, { updates: open.hash, for: open.hash, after: [open.hash] });
  add('the author\'s own stop does', 'promise_stage', [open, [...held2, good], {}], { stage: 'stopped' }, { by: 'subset' });
}
// 6. Money, a price, an amount: an object with its keys, never a bare value.
{
  add('a transfer whose money is a bare number has no shape', 'refusals', ['transfer', { money: 5 }, { to_owner: 'a'.repeat(64) }, []], ['shape'], { by: 'includes_code' });
  add('a thing whose pack is a bare number has no shape', 'refusals', ['thing', { pack: 5 }, {}, []], ['shape'], { by: 'includes_code' });
}
// 7. An actor with no author is a genesis (core.md 4), even with no key: bad_genesis, not a chain error.
add('an actor with no author and no key is a malformed genesis', 'refusals', ['actor', { kind: 'person', at: '2026-10-15T09:00:00.000Z', audience: 'public' }, {}, []], ['bad_genesis'], { by: 'includes_code' });
// 8. An id of another hash is an id: causal edges run through `sm3:` ids.
{
  const { w, people } = mk(5, ['sm', 'sm']);
  const a = w.post(people[0], 'observe', { kind: 'note', text: 'one' });
  const b = w.post(people[0], 'observe', { kind: 'note', text: 'two' }, { after: [a.hash] });
  add('a block sees the sm3: block it names', 'sees', [b, a, w.blocks], true, { by: 'exact', oracle: false });
}
// 9. The counted_to block of a rotation may not have arrived yet: the old key speaks on until it does.
{
  const { w, people } = mk(6);
  const v = people[0];
  const good = w.post(v, 'observe', { kind: 'note', text: 'good' });
  const last = w.post(v, 'thing', { kind: 'eggs', name: 'Stock' }); // bare on purpose: a thing with no kind named stays valid
  const early = w.post(v, 'observe', { kind: 'note', text: 'before the last good block' });
  const nk = fb.keypair(w.r.hex(64), 'std');
  const rot = w.post({ ...v, id: v.id, head: v.id, seq: 0 }, 'grant', { kind: 'key', public_key_sign: nk.public_key_sign, replaces: v.key, counted_to: early.hash, recovery_key: v.recovery.public_key_sign }, { subject: v.id }, { signer: { ...v.recovery, suite: 'std' }, seq: 1, prev: v.id, keepHead: true });
  const held = [w.blocks.find(b => b.hash === v.id), good, rot];
  add('the old key speaks while the counted_to block of its rotation has not arrived', 'valid', [good, held.filter(b => b !== good)], [], { by: 'codes' });
  void last;
}
// 10. A key grant by a key that came in by a rotation, ordered after it though only a note joins them.
{
  const { w, people } = mk(7);
  const v = people[0];
  const old = v.key;
  const nk = fb.keypair(w.r.hex(64), 'std');
  const tail = w.post(v, 'observe', { kind: 'note', text: 'last' });
  const rot = w.post({ ...v, head: v.id, seq: 0 }, 'grant', { kind: 'key', public_key_sign: nk.public_key_sign, replaces: old, counted_to: tail.hash, recovery_key: v.recovery.public_key_sign }, { subject: v.id }, { signer: { ...v.recovery, suite: 'std' }, seq: 1, prev: v.id, keepHead: true });
  const newer = { ...v, key: nk.public_key_sign, private_key: nk.private_key, suite: 'std', head: rot.hash, seq: 0 };
  const note = w.post(newer, 'observe', { kind: 'note', text: 'with the new key' }, { after: [tail.hash] });
  const dk = fb.keypair(w.r.hex(64), 'std');
  const grant = w.post({ ...newer, head: note.hash, seq: 1 }, 'grant', { kind: 'key', public_key_sign: dk.public_key_sign }, { subject: v.id });
  const device = w.post({ ...v, key: dk.public_key_sign, private_key: dk.private_key, suite: 'std', head: grant.hash, seq: 0 }, 'observe', { kind: 'note', text: 'from the second device' }, {});
  add('a device key brought in by a key that was itself brought in by a recovery rotation speaks', 'valid', [device, w.blocks.filter(b => b !== device)], [], { by: 'codes' });
}
// 11. A block may say seq 2^53 - 1: the chain fold lists a bounded number of missing seqs (it asked for 72 PB), and says the chain is not ok.
{
  const id = 'a'.repeat(64);
  const far = { hash: 'b'.repeat(64), type: 'observe', state: { at: '2026-10-15T09:00:00.000Z', audience: 'public', seq: 9007199254740991 }, refs: { author: id, prev: id } };
  add('a block at seq 2^53 - 1 makes a chain that is not ok, without a list of 9e15 gaps', 'check_chain', [[far], id], { ok: false }, { by: 'subset' });
}
// 12. A very long string where an id belongs is a grammar error, not a stack overflow in the grammar matcher.
add('a 70 KB string where an id belongs is refused', 'refusals', ['thing', {}, { of: 'a'.repeat(70000) }, []], ['grammar'], { by: 'includes_code' });
fs.writeFileSync(path.join(__dirname, '../../spec/fuzz-vectors.json'), JSON.stringify({
  $comment: 'Minimal reproducers found by the differential fuzzer (tools/fuzz) and the world simulator (tools/sim). Blocks are made and signed by the spec-only oracle. `by` says how `expect` is read: first_code (the first refusal), includes_code, codes (exactly these, in order), subset (every key of expect matches), exact.',
  vectors: out,
}, null, 1));
console.log(out.length + ' vectors written');
