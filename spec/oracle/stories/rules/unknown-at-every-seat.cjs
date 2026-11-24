// An unknown at every seat (core.md, sections 1 and 11; folds.md, Read whole). Five unknowns: a rule set no build here is made from, an
// undeclared field, an unknown kind, an unknown hash name, and a condition shape no reader knows. Eight seats: the block asked about, the key
// grant it rests on, a block it names for its meaning, a circle's version, one block of a pair, the middle of a chain read whole, the message
// that names a judge, and a sealed block's body. Every unknown at every seat answers less, or the same where it is open data, never more:
// never another owner, never a throw, never a refusal of another's block.
const crypto = require('crypto');
const L = require('../kit.cjs'); const { fb, World, P, T, A, kindOf, instance, accept, check, done, codes, mkKey, sha } = L;
const X = crypto.createHash('sha256').update('a rule set no build here is made from').digest('hex');
const own = (w, t, blocks) => { const r = fb.door('ownership', t, blocks || w.blocks); return r === null || r.not_shown ? [] : r.owners.map(o => L.nm(o.owner)).sort(); };
const readC = (w, b) => { try { return codes(fb.door('read', b, w.blocks)); } catch (e) { return ['not valid']; } };
const sack = (s) => instance(s, kindOf(s, 'sack'), { pack: A('1', 'sack') });
const sealedTo = (who, tag) => [sha('commit:' + who + ':' + tag)];
// each unknown, put on a block's state and refs (a condition sits in a promise's terms, else in its state)
const UNKNOWN = {
  'a rule set': (type, st, rf) => [{ ...st, rule_set: X }, rf],
  'an undeclared field': (type, st, rf) => [{ ...st, colour: 'red' }, rf],
  'an unknown kind': (type, st, rf) => [{ ...st, kind: 'zz-unknown' }, rf],
  'an unknown hash name': (type, st, rf) => [st, { ...rf, after: ['sha9:' + 'ab'.repeat(32)] }],
  'an unknown condition shape': (type, st, rf) => (type === 'promise' && st.terms ? [{ ...st, terms: { ...st.terms, condition: { frost: 'x' } } }, rf] : [{ ...st, condition: { frost: 'x' } }, rf]),
};
const clean = (type, st, rf) => [st, rf];
const put = (s, inj, type, st, rf = {}) => { const [a, b] = inj(type, st, rf); return s.write(type, a, b); };
// each seat: a world with the unknown (or none) at that seat, and what a reader is shown: [who owns the sack, ...]
const SEATS = {
  'the block itself': (inj) => {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), s = sack(harry);
    accept(amara, put(harry, inj, 'transfer', { amount: A('1', 'sack') }, { what: s.hash, to_owner: amara.id }));
    return { owners: own(w, s) };
  },
  'its key grant': (inj) => {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), pK = mkKey('harry-phone-unknown-seat');
    const K1 = put(harry, inj, 'grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S' }] }, { subject: harry.id, updates: harry.id });
    const phone = harry.asKey(pK, K1.hash), s = sack(phone);
    const t = phone.write('transfer', { amount: A('1', 'sack') }, { what: s.hash, to_owner: amara.id });
    accept(amara, t);
    return { amara_owns: own(w, s).includes('amara'), stands: fb.door('stands', t, w.blocks).stands };
  },
  'a block it names': (inj) => {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), s = sack(harry);
    const o = put(harry, inj, 'promise', { terms: L.linesFor(s, { quantity: A('1', 'sack'), price: A('20', 'GBP') }) }, { from: harry.id, to: amara.id });
    const a = amara.write('promise', { status: 'accepted' }, { answers: o.hash, for: o.hash });
    const st = fb.door('promise_stage', o, w.blocks), v = fb.door('promise_view', o, w.blocks, {}, L.day(30));
    return { accept_read: readC(w, a).length === 0, binds: !!(st && !st.not_shown && st.accept), condition_read: !!(v && v.condition !== 'unread' && v.condition !== 'not') };
  },
  'a circle version': (inj) => {
    const w = new World(), kofi = P(w, 'kofi'), s = sack(kofi);
    const row = { parts: 1, scope: { types: ['observe'] } };
    const F = kofi.write('actor', { kind: 'circle', name: 'co-op', pack: A('10', 'part'), rules: [row] }, {});
    put(kofi, inj, 'actor', { kind: 'circle', name: 'co-op', pack: A('10', 'part'), rules: [row, { parts: 1, scope: { types: ['transfer'], parties: 'any', on: 'any', what: 'any', each: A('1', 'sack') } }] }, { as: F.hash, updates: F.hash });
    void s;
    const c = fb.door('circle_state', F.hash, w.blocks);
    return { rows: c === null || c.not_shown ? 0 : c.rules.length };
  },
  'one block of a pair': (inj) => {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), ben = P(w, 'ben'), s = sack(harry);
    const head = harry.head, seq = harry.seq;
    const t1 = harry.write('transfer', { amount: A('1', 'sack') }, { what: s.hash, to_owner: amara.id });
    harry.head = head; harry.seq = seq;
    const t2 = put(harry, inj, 'transfer', { amount: A('1', 'sack') }, { what: s.hash, to_owner: ben.id });
    accept(amara, t1); accept(ben, t2);
    return { owners: own(w, s) };
  },
  'the middle of a chain': (inj) => {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), s = sack(harry);
    put(harry, inj, 'observe', { kind: 'note', text: 'stacked' }, { subject: s.hash });
    accept(amara, harry.write('transfer', { amount: A('1', 'sack') }, { what: s.hash, to_owner: amara.id }));
    return { owners: own(w, s) };
  },
  'the message that names a judge': (inj) => {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), jo = P(w, 'jo'), s = sack(harry);
    const o = harry.write('promise', { terms: L.linesFor(s, { quantity: A('1', 'sack'), price: A('20', 'GBP') }) }, { from: harry.id, to: amara.id });
    amara.write('promise', { status: 'accepted' }, { answers: o.hash, for: o.hash });
    const m = put(harry, inj, 'observe', { kind: 'message', judge: jo.id }, { for: o.hash });
    amara.write('observe', { status: 'accepted' }, { answers: m.hash });
    const st = fb.door('promise_stage', o, w.blocks);
    return { jo_on_bench: !!(st && st.bench && Array.isArray(st.bench.names) && st.bench.names.includes(jo.id)) };
  },
  'a sealed block\'s body': (inj) => {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), s = sack(harry);
    const t = put(harry, inj, 'transfer', { amount: A('1', 'sack'), audience: sealedTo('amara', 'T'), nonce: 'abcdefabcdefabcdefabcdefabcdef12' }, { what: s.hash, to_owner: amara.id });
    accept(amara, t);
    const header = w.blocks.filter(b => b !== t).concat([{ header: fb.door('header', t), header_signature: t.signature }]);
    return { owners: own(w, s), header_only: own(w, s, header) };
  },
};
// "less": no owner, true or count beyond the clean answer's
const within = (got, base) => Object.keys(base).every(k => (Array.isArray(base[k]) ? got[k].every(x => base[k].includes(x)) : typeof base[k] === 'boolean' ? !got[k] || base[k] : got[k] <= base[k]));
const sameAs = (got, base) => JSON.stringify(got) === JSON.stringify(base);
// open data: an unknown kind on a block whose kind no rule reads, and any field of an observe the protocol gives no typed fields to, change no answer;
// a pair already has no owner, so it has nothing to lose
const SAME = new Set(['the block itself|an unknown kind', 'a block it names|an unknown kind', 'the middle of a chain|an undeclared field', 'the middle of a chain|an unknown kind',
  'the middle of a chain|an unknown condition shape', 'the message that names a judge|an undeclared field', 'the message that names a judge|an unknown condition shape',
  'a sealed block\'s body|an unknown kind', ...Object.keys(UNKNOWN).map(u => 'one block of a pair|' + u)]);
for (const [seat, build] of Object.entries(SEATS)) {
  const base = build(clean);
  for (const [u, inj] of Object.entries(UNKNOWN)) {
    const same = SAME.has(seat + '|' + u);
    let got = null, threw = false;
    try { got = build(inj); } catch (e) { threw = true; }
    check(seat, `${u}: ${same ? 'the same answer (open data, or nothing to lose)' : 'answers less'}; never more, never a throw`, [threw, !threw && within(got, base), !threw && sameAs(got, base)], [false, true, same]);
  }
}
done();
