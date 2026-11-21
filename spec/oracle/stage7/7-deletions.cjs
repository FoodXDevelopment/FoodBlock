// Stage 7: what the stage deletes, as stories: `withheld`, `terms.show`, consent `keep` and `move`, the machine lock's fields, the successor profile, the version and the sound part in the discovery document.
const L = require('../core-set-a/lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, deal, sell, check, done, codes, sha } = L;
{
  const w = new World(), amara = P(w, 'amara'), harry = P(w, 'harry');
  const K = kindOf(harry, 'flour');
  const wr = (type, state, refs) => { const b = amara.make(type, state, refs, { keep: true }); return codes(fb.door('write_refusals', { type: b.type, state: b.state, refs: b.refs }, w.blocks)); };
  check('A3', 'terms.show is no term: an offer carrying it is refused (undeclared_field)', wr('promise', { terms: { quantity: A('1', 'sack'), show: ['from'] } }, { from: amara.id, to: harry.id, what: K.hash }), ['undeclared_field']);
  check('A3', 'consent `yes` and `stop` only: a consent block with word `keep` is refused', wr('observe', { kind: 'consent', word: 'keep', to: harry.id }, {}).length > 0, true);
  check('A3', 'consent `move` is refused alike', wr('observe', { kind: 'consent', word: 'move', to: harry.id }, {}).length > 0, true);
  check('A3', 'consent `yes` and `stop` are fine', [wr('observe', { kind: 'consent', word: 'yes', to: harry.id }, { subject: harry.id }), wr('observe', { kind: 'consent', word: 'stop', to: harry.id }, {})], [[], []]);
  const d = deal(harry, K, amara, A('1', 'sack'));
  check('A5', 'promise_stage has no `show` output', Object.keys(fb.door('promise_stage', d.o, w.blocks.concat([K, d.o, d.a]))).includes('show'), false);
}
{
  const w = new World(), amara = P(w, 'amara'), maria = P(w, 'maria');
  // the privacy invariant: a sealed message names no recipient, in its bytes, header or envelope
  const a1 = amara.write('promise', { terms: { quantity: A('1', 'loaf') }, audience: [sha('maria:A1')], nonce: 'abcdefabcdefabcdefabcdefabcdef12' }, { from: amara.id, to: maria.id });
  const priv = '55'.repeat(32), pubE = fb.encPublicOf(priv, 'std');
  const env = fb.door('seal', { block: { type: a1.type, state: a1.state, refs: a1.refs }, reveals: [] }, [pubE], 'std', { pad: true });
  const msg = JSON.stringify({ header: fb.door('header', a1), header_signature: a1.signature, envelope: env });
  check('invariant', 'the header and envelope name no recipient: not her public encryption key, not her id', [msg.includes(pubE), msg.includes(maria.id)], [false, false]);
}
done();
