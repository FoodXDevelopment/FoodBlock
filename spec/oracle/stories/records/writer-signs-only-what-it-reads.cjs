const L = require('../kit.cjs'); const { fb, World, P, check, done, day } = L;
// a writer signs only what its own read reads. World: Mama's phone is asked to sign M2 with `at` of seven fraction digits.
{
  const w = new World(), mama = P(w, 'mama');
  const m1 = mama.write('thing', { name: 'maize' });
  const bad = mama.make('thing', { name: 'M2' }, {}, { at: '2026-11-12T10:00:00.0000001Z' });
  let err = null; try { fb.door('sign', { type: bad.type, state: bad.state, refs: bad.refs }, '00'.repeat(32)); } catch (e) { err = e.kind; }
  check('writer signs what it reads', 'sign of a block its own read refuses (at with seven fraction digits)', err, 'crypto');
  check('writer signs what it reads', 'nothing was signed: her next block is seq', mama.seq + 1, 2);
  const good = mama.make('thing', { name: 'M2' });
  const k = fb.door('keypair', '00'.repeat(32), 'std');
  let ok = true; try { fb.door('sign', { type: good.type, state: good.state, refs: good.refs }, k.private_key); } catch (e) { ok = false; }
  check('writer signs what it reads', 'sign of a block its read reads', ok, true);
}
done();
