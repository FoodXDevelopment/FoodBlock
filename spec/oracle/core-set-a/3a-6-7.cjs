const L = require('./lib.cjs'); const { fb, World, P, check, done, codes, sha } = L;
const crypto = require('crypto'); const sh = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const st = t => fb.door('strict_text', t).map(x => x.code);
// 3a-6 one byte form. Five vectors.
check('3a-6', '(a) keys " and # give {"\\"":1,"#":2}', fb.jcs({ '#': 2, '"': 1 }), '{"\\"":1,"#":2}');
check('3a-6', '(b) keys U+0001 and A: \\u0001 first', fb.jcs({ A: 2, '\u0001': 1 }), '{"\\u0001":1,"A":2}');
const id = 'a'.repeat(64);
const mk = state => fb.jcs({ refs: { author: id, prev: id }, state: { at: '2026-11-12T10:00:00.000Z', audience: 'public', seq: 1, ...state }, type: 'thing' });
check('3a-6', '(c) Maria\'s block with state.batch.refs = {"flours":["spelt","rye"]}: strict_text (nested arrays keep their written order)', st(mk({ batch: { refs: { flours: ['spelt', 'rye'] } } })), []);
check('3a-6', '(d) keys "😀" and "～": ～ first', fb.jcs({ '😀': 1, '～': 2 }), '{"～":2,"😀":1}');
const adl = '\u{1E900}', half = '\uFF71';
const txtE = mk({ [adl]: 2, [half]: 1 });
check('3a-6', '(e) a block whose state has an Adlam key and ｱ: ｱ is written first', txtE.indexOf(half) < txtE.indexOf(adl), true);
check('3a-6', '(e) and it is taken: strict_text says nothing', st(txtE), []);
check('3a-6', 'RFC 8785 order for such keys would put the emoji first, so strict_text of the old order refuses', st('{"refs":{},"state":{"😀":1,"～":2},"type":"thing"}'), ['not_canonical']);
check('3a-6', 'its id is the SHA-256 of its bytes', fb.door('hash', 'thing', { at: '2026-11-12T10:00:00.000Z', audience: 'public', seq: 1, [half]: 1, [adl]: 2 }, { author: id, prev: id }), sh(fb.jcs({ refs: { author: id, prev: id }, state: { at: '2026-11-12T10:00:00.000Z', audience: 'public', seq: 1, [half]: 1, [adl]: 2 }, type: 'thing' })));
check('3a-6', 'a number past 2^53 - 1 is no canonical number', st('{"refs":{},"state":{"n":9007199254740992},"type":"thing"}'), ['not_canonical']);
// 3a-7 sorted sets and the empty set
{
  const w = new World(), sam = P(w, 'sam');
  const s1 = sam.write('observe', { kind: 'note' }, { sees: [] }, {}); // the writer sorts nothing: an empty set is written as is
  check('3a-7', 'valid of a block with refs.sees: []', codes(fb.door('valid', s1, w.blocks)), []);
  check('3a-7', 'read of it: grammar', codes(fb.door('read', s1, w.blocks)), ['grammar']);
  const unsorted = sam.make('observe', { kind: 'note' }, {}); unsorted.refs.sees = ['b'.repeat(64), 'a'.repeat(64)];
  check('3a-7', 'a set out of order: valid', codes(fb.door('valid', unsorted, w.blocks)), ['not_canonical']);
  const rev = sam.make('observe', { kind: 'note' }, {}); rev.refs.sees = ['a'.repeat(64), 'a'.repeat(64)];
  check('3a-7', 'a set with a repeat: valid', codes(fb.door('valid', rev, w.blocks)), ['not_canonical']);
  const nest = sam.make('observe', { kind: 'note', refs: { flours: ['spelt', 'rye'] } }); 
  check('3a-7', 'a refs key inside state is never sorted: valid', codes(fb.door('valid', nest, w.blocks)), []);
  // byte order, not UTF-16 order, inside a set
  const bytes = sam.make('observe', { kind: 'note' }, {}); bytes.refs.sees = ['\uFF5Ex', '\u{1F600}x'];
  check('3a-7', 'a set of strings in UTF-8 byte order (～ before 😀): strict_text', st(fb.jcs({ type: bytes.type, state: bytes.state, refs: bytes.refs })), []);
}
done();
