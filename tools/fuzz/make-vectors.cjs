#!/usr/bin/env node
'use strict';
// Writes spec/fuzz-vectors.json: the minimal reproducers of what the differential fuzzer found.
// Every block is made and signed by the spec-only oracle (spec/oracle/fb.cjs), never by the Rust core. The vectors are run by
// tools/fuzz/run-vectors.cjs (the oracle and the Rust core, both) and by sdk/rust/tests/fuzz_vectors.rs (the core alone).
const fs = require('fs'), path = require('path');
const fb = require('../../spec/oracle/fb.cjs');
const { World, rng, kindOf } = require('./seeded.cjs');

const out = [];
const add = (name, op, args, expect, extra = {}) => out.push({ name, op, args, expect, ...extra });

// -- a small cast
const mk = (seed, suites = ['std', 'std', 'std']) => {
  const w = new World(rng(seed));
  // the first of the cast signs with the standard suite whatever the list says
  const people = suites.map((s, i) => w.newActor('person', i === 0 ? 'std' : s));
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
  // refs.author is one id, and its shape is the line's (valid's `chain`; valid reads five things and gives eight codes)
  add('refs.author as a set is refused, not a block that passes unchecked (chain: refs.author is one id)', 'valid', [bad, w.blocks.filter(x => x !== b)], ['chain'], { by: 'first_code' });
}
// 3. state.kind is a label (text), in a genesis too.
{
  const w = new World(rng(3));
  const a = fb.keypair(w.r.hex(64), 'std');
  const state = { kind: { x: 'person' }, at: '2026-10-15T09:00:00.000Z', audience: 'public', public_key_sign: a.public_key_sign };
  const body = { type: 'actor', state, refs: {} };
  const g = { hash: fb.hashOfBlock(body, 'std'), ...body, signature: fb.signBlock(body, a.private_key, 'std') };
  // valid says who said the bytes; a value is read's to judge
  add('a genesis whose kind is an object is refused by read', 'read', [g, []], ['bad_genesis'], { by: 'first_code' });
}
// 4/5. Only a side answers a deal; only the author stops an open offer.
{
  const { w, people } = mk(4, ['std', 'std', 'std', 'std']);
  const [s, buyer, thief, stranger] = people;
  const thing = w.post(s, 'thing', { kind: 'eggs', name: 'Eggs' }, { of: kindOf('eggs') }); // an instance, as the generators write one (things.md)
  const offer = w.post(s, 'promise', { terms: { lines: [{ id: 'eggs', what: thing.hash, quantity: { value: '6', unit: '{egg}' }, price: { value: '1.00', unit: 'GBP' } }], expires: '2026-10-20T00:00:00.000Z' } }, { from: s.id, to: buyer.id });
  const blocks = w.blocks.slice();
  const steal = w.post(thief, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, after: [offer.hash] });
  // whether the signer is a side is the fold's (a side may name a thing whose owner the check cannot know): the accept is
  // valid, and binds nothing
  add('an accept by someone who is not a side of the deal is valid: the bytes are sound', 'valid', [steal, blocks], [], { by: 'first_code' });
  add('and it binds nothing: the offer stays offered', 'promise_stage', [offer, [...blocks, steal], {}], { stage: 'offered' }, { by: 'subset' });
  const open = w.post(s, 'promise', { terms: { lines: [{ id: 'eggs', what: thing.hash, quantity: { value: '6', unit: '{egg}' }, price: { value: '1.00', unit: 'GBP' } }], expires: '2026-10-20T00:00:00.000Z' } }, { from: s.id });
  const held2 = w.blocks.slice();
  // the stop is signed by someone whose chain holds no refused block: a fold and a node read only blocks that pass the check (folds.md),
  // so a chain that rests on the thief's refused accept is unmet, whatever else is wrong with it
  const stop = w.post(stranger, 'promise', { status: 'stopped', stop: 'before' }, { updates: open.hash, for: open.hash, after: [open.hash] });
  add('a stop of an open offer by anyone but its author is valid: it counts for nothing in the fold', 'valid', [stop, held2], [], { by: 'first_code' });
  add('the stranger\'s stop does not stop the offer in the fold', 'promise_stage', [open, [...held2, stop], {}], { stage: 'offered' }, { by: 'subset' });
  const good = w.post(s, 'promise', { status: 'stopped', stop: 'before' }, { updates: open.hash, for: open.hash, after: [open.hash] });
  add('the author\'s own stop does', 'promise_stage', [open, [...held2, good], {}], { stage: 'stopped' }, { by: 'subset' });
}
// 6. Money, a price, an amount: an object with its keys, never a bare value.
{
  // money is an amount; the door's refusals are `write_refusals`
  const five = { at: '2026-10-15T09:00:00.000Z', audience: 'public', seq: 2 }, line = { author: 'a'.repeat(64), prev: 'b'.repeat(64) };
  add('a transfer whose amount is a bare number has no shape', 'write_refusals', [{ type: 'transfer', state: { ...five, amount: 5 }, refs: { ...line, to_owner: 'c'.repeat(64) } }, []], ['shape'], { by: 'includes_code' });
  add('a thing whose pack is a bare number has no shape', 'write_refusals', [{ type: 'thing', state: { ...five, pack: 5 }, refs: line }, []], ['shape'], { by: 'includes_code' });
}
// 7. An actor with no author is a genesis (core.md 4), even with no key: bad_genesis, not a chain error.
// A genesis names its own key; an actor that names no key and no author lacks the common five (`chain`)
add('an actor with no author and no key is no genesis: it lacks the common five', 'write_refusals', [{ type: 'actor', state: { kind: 'person', at: '2026-10-15T09:00:00.000Z', audience: 'public' }, refs: {} }, []], ['chain'], { by: 'includes_code' });
// 8. An id of another hash is an id: causal edges run through `sm3:` ids.
{
  const { w, people } = mk(5, ['sm', 'sm']);
  const a = w.post(people[0], 'observe', { kind: 'note', text: 'one' });
  const b = w.post(people[0], 'observe', { kind: 'note', text: 'two' }, { after: [a.hash] });
  add('a block sees the sm3: block it names', 'sees', [b, a, w.blocks], true, { by: 'exact', oracle: false });
}
// 9 and 10 are not here: recovery is a voice of her list, and the stories of a key under a voice cover a key brought in by another.
// 11. A block may say seq 2^53 - 1: the chain fold lists a bounded number of missing seqs (it asked for 72 PB), and says the chain is not ok.
{
  const id = 'a'.repeat(64);
  const far = { hash: 'b'.repeat(64), type: 'observe', state: { at: '2026-10-15T09:00:00.000Z', audience: 'public', seq: 9007199254740991 }, refs: { author: id, prev: id } };
  add('a block at seq 2^53 - 1 makes a chain that is not ok, without a list of 9e15 gaps', 'check_chain', [[far], id], { ok: false }, { by: 'subset' });
}
// 12. A very long string where an id belongs is a grammar error, not a stack overflow in the grammar matcher.
// The bytes are read before the grammar, so a 70 KB block is over the size limit first (size, bytes, header, pieces, signature)
add('a 70 KB string where an id belongs is refused, and nothing overflows', 'write_refusals', [{ type: 'thing', state: {}, refs: { of: 'a'.repeat(70000) } }, []], ['size_limit'], { by: 'includes_code' });
fs.writeFileSync(path.join(__dirname, '../../spec/fuzz-vectors.json'), JSON.stringify({
  $comment: 'Minimal reproducers found by the differential fuzzer (tools/fuzz). Blocks are made and signed by the spec-only oracle. `by` says how `expect` is read: first_code (the first refusal), includes_code, codes (exactly these, in order), subset (every key of expect matches), exact.',
  vectors: out,
}, null, 1));
console.log(out.length + ' vectors written');
