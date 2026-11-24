const L = require('../kit.cjs'); const { fb, World, P, check, done, codes, sha, message, wire, cj } = L;
// One reader for every message, and the answer of strict_push. World: Sam's till pushes { messages: [S1], for: 1.5 }: refused whole.
const w = new World(), sam = P(w, 'sam');
const s1 = sam.write('thing', { name: 'S1' });
const push = (messages, fr) => '{"for":' + fr + ',"messages":' + messages + '}';
const msgs = '[' + wire(message(s1)) + ']';
const out = t => { const r = fb.door('strict_push', t); return { refused: r.refused && r.refused.code, messages: r.messages.map(m => m.map(x => x.code)) }; };
check('one reader for every message', 'for: 1.5 refuses the whole push', out(push(msgs, '1.5')), { refused: 'not_canonical', messages: [] });
check('one reader for every message', 'for: 2^53 refuses the whole push', out(push(msgs, '9007199254740992')), { refused: 'not_canonical', messages: [] });
check('one reader for every message', 'a float inside one block refuses the whole push', out(push('[{"block":{"refs":{},"state":{"n":1.5},"type":"thing"},"signature":"00"}]', '"x"')), { refused: 'not_canonical', messages: [] });
check('one reader for every message', 'a null anywhere refuses the whole push', out(push('[{"block":{"refs":{},"state":{"n":null},"type":"thing"},"signature":"00"}]', '"x"')), { refused: 'not_canonical', messages: [] });
check('one reader for every message', 'an extra top key is refused (no argument error)', out('{"extra":1,"for":"x","messages":[]}'), { refused: 'not_canonical', messages: [] });
const deep = n => '['.repeat(n) + ']'.repeat(n);
check('one reader for every message', 'a push 64 levels deep is taken', out('{"for":' + deep(63) + ',"messages":[]}'), { messages: [] });
check('one reader for every message', 'a push 65 levels deep is refused', out('{"for":' + deep(64) + ',"messages":[]}'), { refused: 'size_limit', messages: [] });
check('strict push answer', 'a push not canonical whole: { refused: { code, hash }, messages: [] }', (() => { const r = fb.door('strict_push', ' {"for":"x","messages":[]}'); return [Object.keys(r).sort(), r.refused.code, r.refused.hash === sha(' {"for":"x","messages":[]}'), r.messages]; })(), [['messages', 'refused'], 'not_canonical', true, []]);
check('one reader for every message', 'a push that says nothing in `for` leaves it out, and is read', out('{"messages":' + msgs + '}'), { messages: [[]] });
check('strict push answer', 'a good push: one list per message', out(push(msgs, '"x"')), { messages: [[]] });
// one hash twice, in either order: the valid copy is kept
{
  const bad = { ...s1, signature: '00'.repeat(64) };
  for (const order of [[s1, bad], [bad, s1]]) {
    const r = fb.door('accept', order, w.blocks.filter(b => b !== s1), { takes_pairs: false });
    check('one reader for every message', 'one hash twice, a bad copy ' + (order[0] === s1 ? 'after' : 'before') + ' the good one: S1 taken', { taken: r.taken.includes(s1.hash), refused: r.refused.length }, { taken: true, refused: 0 });
  }
}
done();
