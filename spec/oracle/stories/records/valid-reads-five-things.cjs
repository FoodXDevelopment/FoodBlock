const L = require('../kit.cjs'); const { fb, World, P, T, person, check, done, codes, day, sha, cj, headerOf } = L;
// valid reads five things. World: Harry H0; Harry H1 seq 1, a thing L7 pack 1 sack, `at` with seven fraction digits.
{
  const w = new World(), harry = P(w, 'harry');
  const l7 = harry.write('thing', { name: 'L7', pack: { value: '1', unit: 'sack' } }, {}, { at: '2026-11-12T10:00:00.0000001Z' });
  check('valid reads five things', 'valid(H1) with at of seven fraction digits', codes(fb.door('valid', l7, w.blocks)), []);
  check('valid reads five things', 'read(H1)', codes(fb.door('read', l7, w.blocks)), ['time']);
  // a float: its bytes are no canonical bytes
  const f = { ...l7, state: { ...l7.state, size: 1.5 } };
  check('valid reads five things', 'a block with a float in its state: valid', codes(fb.door('valid', f, w.blocks)), ['not_canonical']);
  // a block with no state.seq: the header
  const noseq = harry.make('thing', { name: 'x' }); delete noseq.state.seq;
  check('valid reads five things', 'a block with no seq: valid (the header)', codes(fb.door('valid', noseq, w.blocks)), ['chain']);
  // size first: bytes over the limit are size_limit and nothing else is read
  const big = harry.make('thing', { name: 'big', blob: 'x'.repeat(70000), note: 1.5 });
  check('valid reads five things', 'bytes over limits.block_bytes (with a float inside): valid', codes(fb.door('valid', big, w.blocks)), ['size_limit']);
  // a type that is no word: read's, never valid's
  const tn = harry.make('Not A Type', { name: 'x' });
  check('valid reads five things', 'type_name moves to read: valid', codes(fb.door('valid', tn, w.blocks)), []);
  check('valid reads five things', 'type_name moves to read: read', codes(fb.door('read', tn, w.blocks)), ['type_name']);
  // forged: the id is not the hash of the bytes: bad_hash alone
  const forged = { ...l7, hash: sha('other') };
  check('valid reads five things', 'a forged id: valid gives bad_hash alone', codes(fb.door('valid', forged, w.blocks)), ['bad_hash']);
  // a bad signature with the right id
  const bs = { ...l7, signature: '00'.repeat(64) };
  check('valid reads five things', 'a bad signature, right id: valid', codes(fb.door('valid', bs, w.blocks)), ['bad_signature']);
  // a genesis whose values are bad: valid, then read's bad_genesis
  const g = w.blocks[0];
  check('valid reads five things', 'the genesis: valid', codes(fb.door('valid', g, w.blocks)), []);
  // the pieces wait
  check('valid reads five things', 'a block whose genesis is not held: valid', codes(fb.door('valid', l7, [])), ['unmet']);
}
done();
