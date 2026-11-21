const L = require('./lib.cjs'); const { fb, World, P, check, done, codes, sha } = L;
// 3a-5 a node shows a body only to an audience it can read. World: a relay holds Amara's sealed order whose audience it cannot read; Sam pulls it.
{
  const w = new World(), amara = P(w, 'amara'), sam = P(w, 'sam'), maria = P(w, 'maria');
  const unreadable = 'zz9:' + sha('maria');           // a commitment in a hash name this node does not know
  const sealed = amara.write('promise', { terms: { quantity: { value: '1', unit: 'loaf' } } }, { from: amara.id }, {});
  sealed.state = { ...sealed.state }; 
  const mk = aud => { const b = amara.make('observe', { kind: 'note', audience: aud, nonce: 'abcdefabcdefabcdefabcdefabcdef12' }); return b; };
  const b = mk([unreadable]);
  // the order is sealed to Maria: the relay holds her copy, none for Sam (a copy pushed for one person goes to her as it came: it shows no body)
  const log = [{ n: 1, block: b, copies: { [maria.id]: { header: fb.door('header', b), header_signature: b.signature, envelope: { x: 1 } } } }];
  const ans = fb.door('answer_pull', log, { since: 0 }, 'relay', null, { cap: 10, serves_pairs: false }, sam.id, w.blocks, 'std', null);
  const msg = ans.blocks[0] && ans.blocks[0].message;
  // stage 7 (07-last.md A2, nodes.md line 37 kept from 1.8): nothing of a sealed block goes to an asker the node holds no copy for, and for her it matches no filter. This replaces 3a-5's header-only answer to Sam (stage7-oracle-silent.md, conflict 1).
  check('3a-5', 'the relay holds a body whose audience it cannot read and no copy for Sam: nothing of it goes to Sam (stage 7, A2)', ans.blocks.length, 0);
  const forMaria = fb.door('answer_pull', log, { since: 0 }, 'relay', null, { cap: 10, serves_pairs: false }, maria.id, w.blocks, 'std', null);
  check('3a-5', 'the same pull signed by Maria, for whom it holds a copy: the copy as it came (no body shown)', Object.keys(forMaria.blocks[0].message).sort(), ['envelope', 'header', 'header_signature']);
  const readable = amara.make('observe', { kind: 'note', audience: [sha('sam')], nonce: 'abcdefabcdefabcdefabcdefabcdef12' });
  const log2 = [{ n: 1, block: readable, copies: { [sam.id]: { header: fb.door('header', readable), header_signature: readable.signature, envelope: { x: 1 } } } }];
  const ans2 = fb.door('answer_pull', log2, { since: 0 }, 'relay', null, { cap: 10, serves_pairs: false }, sam.id, w.blocks, 'std', null);
  check('3a-5', 'the same, an audience it can read and a copy for Sam: the copy', Object.keys(ans2.blocks[0].message).sort(), ['envelope', 'header', 'header_signature']);
}
done();
