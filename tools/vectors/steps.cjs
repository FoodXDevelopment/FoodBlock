'use strict';
// The steps that move the vectors' inputs to the current shapes. tools/vectors.cjs applies them on every run; on a file already in the
// current shapes they change nothing (each step looks for the shape it replaces and leaves anything else alone). They hold no answer:
// every answer is the oracle's, checked against the core, after these steps. A step that has done its work everywhere is deleted (git
// holds it).
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- a deal is its lines (promises.md, Terms, A deal is its lines): a promise names nothing in refs.what and states no top-level price or
// quantity. A promise in the old form becomes one line, id '1', for each thing it named (the price and quantity on the first); an answer's
// chosen quantity names that line.
const LINE = '1';
function toLines(terms, what) {
  const t = { ...terms };
  const { price, quantity } = t;
  delete t.price; delete t.quantity;
  if (Array.isArray(t.lines)) return t;
  const things = what === undefined ? [] : Array.isArray(what) ? what : [what];
  if (!things.length && price === undefined && quantity === undefined) return terms;
  const lines = (things.length ? things : [undefined]).map((w, i) => ({
    id: things.length > 1 ? String(i + 1) : LINE,
    ...(w !== undefined ? { what: w } : {}),
    ...(i === 0 && quantity !== undefined ? { quantity } : {}),
    ...(i === 0 && price !== undefined ? { price } : {}),
  }));
  return { ...t, lines };
}
function promiseLines(state, refs) {
  const terms = isObj(state.terms) ? state.terms : undefined;
  if (state.status !== undefined) {
    // an answer names only the quantities it chooses
    if (terms && terms.quantity !== undefined && terms.lines === undefined) { const { quantity, ...rest } = terms; state.terms = { ...rest, lines: [{ id: LINE, quantity }] }; }
    return;
  }
  const hadWhat = refs.what !== undefined;
  if (hadWhat || (terms && (terms.price !== undefined || terms.quantity !== undefined))) {
    state.terms = toLines(terms || {}, refs.what);
    delete refs.what;
  }
  if (hadWhat) delete refs.what;
}

// ---- the figure kinds a line's price fixed later names: a figure names its line
let FIGURES = new Set();
// ---- a judge named late is a term both sides signed (promises.md, A new term both sides signed): a grant of kind `referee` becomes a side's
// message `for` the deal (or claim) stating `judge`, and a grant answering it `accepted` becomes an observe answering it `accepted`
let NAMINGS = new Set();
function prepare(V) {
  const kinds = new Set(), namings = new Set();
  const w = (x) => { if (Array.isArray(x)) x.forEach(w); else if (isObj(x)) { if (isObj(x.price) && typeof x.price.figure === 'string') kinds.add(x.price.figure); if (x.type === 'grant' && isObj(x.state) && (x.state.kind === 'referee' || x.state.kind === 'message') && typeof x.hash === 'string') namings.add(x.hash); Object.values(x).forEach(w); } };
  w(V);
  FIGURES = kinds; NAMINGS = namings;
}
function judgeNaming(body) {
  if (body.type === 'grant' && body.state.kind === 'referee' && body.state.status === undefined) {
    const { kind, scope, ...state } = body.state;
    const { to, subject, ...refs } = body.refs;
    return { type: 'observe', state: { ...state, kind: 'message', judge: to }, refs: { ...refs, for: subject } };
  }
  // a message is an observe: one written with the type grant is that observe
  if (body.type === 'grant' && body.state.kind === 'message' && body.state.status === undefined) { const { scope, ...state } = body.state; return { type: 'observe', state, refs: body.refs }; }
  if (body.type === 'grant' && body.state.status === 'accepted' && NAMINGS.has(body.refs.answers)) {
    const { kind, scope, ...state } = body.state;
    return { type: 'observe', state, refs: body.refs };
  }
  return body;
}

// ---- a grant's end is `expires` (authority.md, `state.scope`): a scope's `until` becomes `expires`, in a grant, a circle's rows and a bare scope; an
// address's `until` becomes `expires`. A share's `state.until` and a promise's `terms.until` are other fields and stay.
function scopeExpires(scope) {
  if (isObj(scope) && scope.until !== undefined && scope.expires === undefined) { scope.expires = scope.until; delete scope.until; return true; }
  return false;
}
// ---- a panel is `{ names, needed }` (folds.md, Counts): a signal's or a price fixed later's `by` list becomes one, `signers` becoming its `needed`.
// Anywhere inside a state, nested conditions and lines' prices too; the names keep their order.
function panels(x) {
  let moved = false;
  const w = (v) => {
    if (Array.isArray(v)) v.forEach(w);
    else if (isObj(v)) {
      if ((typeof v.signal === 'string' || typeof v.figure === 'string') && Array.isArray(v.by)) {
        v.by = { names: v.by, ...(v.signers !== undefined ? { needed: v.signers } : {}) };
        delete v.signers; moved = true;
      }
      Object.values(v).forEach(w);
    }
  };
  w(x);
  return moved;
}
// ---- a schema's bench is `grounds.bench` `{ names, needed }` (things.md, Schemas): `confirmers` and `needed` move into it; `wait` and `clocks` stay
function schemaBench(grounds) {
  if (!isObj(grounds) || !Array.isArray(grounds.confirmers)) return;
  grounds.bench = { names: grounds.confirmers, ...(grounds.needed !== undefined ? { needed: grounds.needed } : {}) };
  delete grounds.confirmers; delete grounds.needed;
}

function after(body0) {
  const body = judgeNaming(body0);
  const state = clone(body.state);
  const refs = clone(body.refs);
  // a schema declares no `undo` (things.md, Schemas)
  if (body.type === 'thing' && state.kind === 'schema') { delete state.undo; if (isObj(state.fields)) delete state.fields.undo; }
  if (body.type === 'promise') promiseLines(state, refs);
  if (body.type === 'observe' && FIGURES.has(state.kind) && state.line === undefined && state.amount !== undefined) state.line = LINE;
  if (body.type === 'grant') scopeExpires(state.scope);
  if (body.type === 'actor' && state.kind === 'circle' && Array.isArray(state.rules)) state.rules.forEach((r) => { if (isObj(r)) scopeExpires(r.scope); });
  if (body.type === 'observe' && state.kind === 'address' && state.until !== undefined && state.expires === undefined) { state.expires = state.until; delete state.until; }
  panels(state);
  if (body.type === 'thing' && state.kind === 'schema') schemaBench(state.grounds);
  // no grant kind is the operator's: the ledger's grant to an agent is a plain grant to it
  if (body.type === 'grant' && state.kind === 'operator') state.kind = 'agent';
  return { type: body.type, state, refs };
}

// ---- an op's arguments that carry bare terms (not a block): `terms_total(terms, chosen)`
function convertOp(c) {
  if (c.op === 'terms_total' && isObj(c.args[0]) && (c.args[0].price !== undefined || c.args[0].quantity !== undefined)) {
    const args = clone(c.args);
    args[0] = toLines(args[0], undefined);
    if (isObj(args[1])) args[1] = [{ id: LINE, quantity: args[1] }];
    return { ...c, args, _why: 'a deal is its lines; terms_total takes the lines an answer chooses' };
  }
  // a bare scope or condition as an argument: a scope's `until` is `expires`; a signal's or a figure's `by` is a panel
  if (!isStoryCaseOp(c)) {
    const args = clone(c.args || []);
    let moved = false;
    if (c.op === 'scope_reading' && scopeExpires(args[0])) moved = true;
    args.forEach((a, i) => { if (isObj(a) && !(typeof a.type === 'string' && isObj(a.state)) && ['condition_holds', 'count_of', 'worst_case', 'scope_reading'].includes(c.op) && panels(a)) moved = true; });
    if (moved) return { ...c, args, _why: 'a grant ends at `expires`; a panel is `{ names, needed }`' };
  }
  return c;
}
const isStoryCaseOp = (c) => isObj(c) && typeof c.story === 'string';

// ---- ops that are gone, and why (a case of an op neither engine answers is deleted with this reason)
const GONE = { why_not_live_undo: 'the `undo` rule and schema field are gone (things.md, Schemas)' };

// ---- what changed each op's answers, for a renewed case
const RENEWED = {
  promise_stage: 'a deal is its lines: no top-level quantity; takers draw per line (promises.md, Terms); the judges a deal names answer as `judge_ties`',
  promise_view: 'a deal is its lines (promises.md, Terms)',
  promise_views: 'a deal is its lines (promises.md, Terms)',
  terms_total: 'a deal is its lines; the second argument is the lines chosen',
  gives: 'a deal is its lines (promises.md, What becomes whose)',
  scope_reading: 'a grant ends at `expires` (authority.md, A grant\'s scope)',
  use_shown: 'a grant ends at `expires` (authority.md, A grant\'s scope)',
  worst_case: 'a grant ends at `expires`; each line of a promise in `on` is a measure (authority.md, Her quantity is the measure)',
  meter: 'each line of a promise in `on` is a measure, `<promise>#<line>` (authority.md, Her quantity is the measure)',
};
const renewReason = (op) => RENEWED[op] || 'its inputs moved to the current shapes (a deal is its lines; no schema `undo`)';

// ---- a case says which numbered invariant it shows (core.md, Invariants), read from what it answers, never from its words: a refusal for a
// missing required field or an undeclared one shows 7 (a closed type has its fields and no others); a draw that takes nothing because its
// signer owns none of the measure shows 25 (an amount changes only by a block that speaks for its owner)
function tagInvariants(cases) {
  const add = (c, n) => { const s = new Set(Array.isArray(c.invariants) ? c.invariants : []); if (s.has(n)) return; s.add(n); c.invariants = [...s].sort((a, b) => a - b); };
  const codesOf = (c) => JSON.stringify([c.expect, c.codes, c.subset]);
  for (const c of cases) {
    if (['read', 'valid', 'write_refusals'].includes(c.op) && /"(required|undeclared_field|undeclared_ref)"/.test(codesOf(c))) add(c, 7);
    if (c.op === 'ownership' && /"why":"not_owner"/.test(JSON.stringify(c.expect || ''))) add(c, 25);
  }
}

module.exports = { prepare, after, convertOp, GONE, renewReason, tagInvariants };
