// shared story helpers: names, a printer, and the deal builders
const L = require('./lib.cjs');
const { fb, World, person, A, kindOf, instance, give, accept, J, day } = L;
const NAME = new Map();
const P = (w, n) => { const p = person(w, n); NAME.set(p.id, n); return p; };
const nm = h => (h === null || h === undefined ? null : NAME.get(h) || (typeof h === 'string' ? h.slice(0, 6) : h));
const am = a => (a ? a.value + ' ' + a.unit + (a.of ? '/' + a.of.slice(0, 4) : '') : null);
const TAG = new Map(); // block hash -> label, for readable draws
const T = (b, label) => { TAG.set(b.hash, label); return b; };
const tg = h => TAG.get(h) || h.slice(0, 6);
const show = r => r === null ? 'null' : r.not_shown ? 'not_shown ' + J(r.lacks.map(x => (typeof x === 'string' ? tg(x) : x))) : J({ kind: r.kind && r.kind.unit, stated: r.stated && r.stated.value, owners: r.owners.map(o => [nm(o.owner), o.amount && o.amount.value]), owner: nm(r.owner), held: r.held && r.held.value, ended: r.ended && r.ended.value, let_go: r.let_go && r.let_go.value, draws: r.draws.map(d => [tg(d.block), nm(d.by), nm(d.to), d.amount && d.amount.value, d.takes, d.why, d.state]), waiting: r.waiting.map(x => [tg(x.block), x.on]) });
const draws = r => (r.not_shown ? 'not_shown' : r.draws.map(d => tg(d.block) + (d.takes ? ' takes ' + (d.state || '') : ' ' + (d.why || 'waiting'))).join('; '));
const own = (w, thing) => fb.door('ownership', thing, w.blocks);
const ownS = (w, thing) => { const r = own(w, thing); return r === null ? 'null' : r.not_shown ? 'not_shown' : 'owners ' + J(r.owners.map(o => [nm(o.owner), o.amount && o.amount.value])) + ' held ' + (r.held && r.held.value) + ' ended ' + (r.ended && r.ended.value) + ' | ' + draws(r); };
const Q = (story, q, a) => console.log(`${story} | ${q} => ${a}`);
const offer = (s, from, to, what, terms, state = {}, refs = {}) => s.write('promise', { terms, ...state }, { from: from.id, to: to.id, what: what.map ? what.map(x => x.hash) : what.hash, ...refs });
const accepts = (s, o, state = {}, refs = {}) => s.write('promise', { status: 'accepted', ...state }, { answers: o.hash, for: o.hash, ...refs });
module.exports = { ...L, NAME, TAG, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts };
