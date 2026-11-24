// What a promise may carry (core.md, section 7; promises.md, Terms and A deal is its lines): a term the protocol does not declare is refused as any
// undeclared field is; what moves is in its lines and nowhere else; a promise states its lines or says in `state.what` what it is; a line is a loan
// or a job, never both: a line with no `what` whose quantity is of its price's own kind is a loan, and in a promise that names a job it is refused.
const L = require('./lib.cjs'); const { World, P, A, kindOf, check, done, GBP } = L;
const w = new World(), a = P(w, 'a'), b = P(w, 'b');
const find = (type, state, refs) => L.fb.door('write_refusals', { type, state, refs: { author: a.id, prev: a.id, ...refs } }, w.blocks).map(x => x.code);
const base = { from: a.id, to: b.id };
const day0 = '2026-11-01T00:00:00.000Z';
const oneLine = { lines: [{ id: 'fee', price: GBP(1) }] };
const codesOf = (state, refs = base) => find('promise', { seq: 1, at: day0, audience: 'public', ...state }, refs);
const undeclared = terms => codesOf({ terms: { ...oneLine, ...terms } }).includes('undeclared_field');
check('what a promise carries', 'a term the protocol does not declare is refused', undeclared({ colour: 'red' }), true);
check('what a promise carries', 'clocks, waits_on, step and in_hand are terms', [undeclared({ clocks: { names: [a.id], needed: 1 } }), undeclared({ waits_on: 'price' }), undeclared({ step: A('1', 'GBP') }), undeclared({ in_hand: true })], [false, false, false, false]);
check('what a promise carries', 'a promise naming refs.what is refused as `lines`', codesOf({ terms: oneLine }, { ...base, what: kindOf(a, 'x').hash }).includes('lines'), true);
check('what a promise carries', 'a promise with neither terms.lines nor state.what is refused as `required`', codesOf({ terms: { expires: day0 } }).includes('required'), true);
check('what a promise carries', 'a line that moves an amount, in a promise whose state.what names a job, is refused as `lines`', codesOf({ what: 'a loan of £20', terms: { lines: [{ id: 'loan', quantity: GBP(20), price: GBP(22) }] } }).includes('lines'), true);
check('what a promise carries', 'the same loan with no state.what is a loan', codesOf({ terms: { lines: [{ id: 'loan', quantity: GBP(20), price: GBP(22) }] } }), []);
check('what a promise carries', 'a job: lines with neither what nor quantity, and state.what saying what is done', codesOf({ what: 'plough the field', terms: { lines: [{ id: 'job', price: GBP(40) }] } }), []);
check('what a promise carries', 'a job measured in hours: teach for 2 hours at £20 an hour is valid', codesOf({ what: 'teach sourdough', terms: { lines: [{ id: 'lesson', quantity: A('2', 'h'), price: { amount: GBP(20), per: A('1', 'h') } }] } }), []);
check('what a promise carries', 'a job of 2 hours with no price is valid', codesOf({ what: 'teach sourdough', terms: { lines: [{ id: 'lesson', quantity: A('2', 'h') }] } }), []);
done();
