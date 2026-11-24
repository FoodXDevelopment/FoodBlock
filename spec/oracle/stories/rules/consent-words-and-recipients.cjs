// Consent words are a reading's (readings/consent.md): a word outside `yes` and `stop` is refused by nothing and read as nothing. A sealed message names
// no recipient (privacy.md, invariant 27). document.
const L = require('../kit.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, deal, sell, check, done, codes, sha } = L;
{
  const w = new World(), amara = P(w, 'amara'), harry = P(w, 'harry');
  const K = kindOf(harry, 'flour');
  const wr = (type, state, refs) => { const b = amara.make(type, state, refs, { keep: true }); return codes(fb.door('write_refusals', { type: b.type, state: b.state, refs: b.refs }, w.blocks)); };
  // consent is a reading (readings/consent.md): a word outside `yes` and `stop` is refused by nothing, and the reading reads no word from it
  check('consent words', 'a consent block with word `keep` or `move` is no protocol shape: nothing refuses it', [wr('observe', { kind: 'consent', word: 'keep', to: harry.id }, {}), wr('observe', { kind: 'consent', word: 'move', to: harry.id }, {})], [[], []]);
  const keep = amara.write('observe', { kind: 'consent', word: 'keep' }, { subject: harry.id });
  check('consent words', 'the consent reading reads no word from `keep`', fb.door('consent', amara.id, harry.id, w.blocks).word, null);
  void keep;
  check('consent words', 'consent `yes` and `stop` are fine', [wr('observe', { kind: 'consent', word: 'yes', to: harry.id }, { subject: harry.id }), wr('observe', { kind: 'consent', word: 'stop', to: harry.id }, {})], [[], []]);
}
{
  const w = new World(), amara = P(w, 'amara'), maria = P(w, 'maria');
  // the privacy invariant: a sealed message names no recipient, in its bytes, header or envelope
  const a1 = amara.write('promise', { terms: require('../kit.cjs').linesFor(null, { quantity: A('1', 'loaf') }), audience: [sha('maria:A1')], nonce: 'abcdefabcdefabcdefabcdefabcdef12' }, { from: amara.id, to: maria.id });
  const priv = '55'.repeat(32), pubE = fb.encPublicOf(priv, 'std');
  const env = fb.door('seal', { block: { type: a1.type, state: a1.state, refs: a1.refs }, reveals: [] }, [pubE], 'std', { pad: true });
  const msg = JSON.stringify({ header: fb.door('header', a1), header_signature: a1.signature, envelope: env });
  check('no recipient named', 'the header and envelope name no recipient: not her public encryption key, not her id', [msg.includes(pubE), msg.includes(maria.id)], [false, false]);
}
done();
