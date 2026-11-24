// (things.md, Things: Schemas) A community types its own fields in its own schema, named by hash, and asks no one. A shape is `read`'s, never `valid`'s.
const L = require('../kit.cjs'); const { fb, World, P, T, A, kindOf, check, done, codes } = L;
{
  const w = new World(), kofi = P(w, 'kofi'), ama = P(w, 'ama');
  const sch = T(kofi.write('thing', { kind: 'schema', name: 'recall', fields: { recalled_from: 'time!' } }), 'SCH');
  const lk = T(kofi.write('thing', { kind: 'schema', name: 'recall', fields: { recalled_from: 'text' } }), 'LK');
  const crate = kindOf(kofi, 'crate');
  const rec = (state, schema) => kofi.write('promise', { terms: require('../kit.cjs').linesFor(crate, { quantity: A('1', 'crate') }), ...state }, { from: kofi.id, to: ama.id, schema: schema.hash });
  const good = rec({ recalled_from: '2026-11-02T00:00:00.000Z' }, sch), bad = rec({ recalled_from: 'banana' }, sch), none = rec({}, sch), look = rec({ recalled_from: 'banana' }, lk);
  check('typed fields', 'the Kisumu co-op\'s `recalled_from:time`: a block naming the schema with a time is read', codes(fb.door('read', good, w.blocks)), []);
  check('typed fields', 'with "banana": read gives shape; valid still gives []', [codes(fb.door('read', bad, w.blocks)), fb.door('valid', bad, w.blocks)], [['shape'], []]);
  check('typed fields', 'a field the schema asks for (`!`) and the block lacks: required', codes(fb.door('read', none, w.blocks)), ['required']);
  check('typed fields', 'a block naming a look-alike schema of another hash is read under that one only', codes(fb.door('read', look, w.blocks)), []);
  check('typed fields', 'a schema not held: the block waits (names_missing)', codes(fb.door('read', good, w.blocks.filter(b => b !== sch))), ['names_missing']);
}
done();
