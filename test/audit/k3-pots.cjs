// Stage 3 of FoodBlock 1.8, amounts (changes-1.8/03-amounts.md): its pot stories as signed worlds both engines can be run on (folds.md,
// A pot; section 6, vectors 21 to 23). Each question names a door op, its arguments (`held`: the blocks held when it was asked),
// `expect` (what the spec text says, with `text`, the sentence it says it in) and `core` (what the Rust core answered). Run alone
// (`node test/audit/k3-pots.cjs`) it prints every question and each place the core differs from the text; `require` it for
// `{ worlds, questions }`.
const L = require('./k3-lib.cjs')
const { World, amt, put, thing, yes, drawView, D, sums } = L

const questions = []
const ask = L.makeAsk(questions)
const gbp = (n) => amt(n, 'GBP')
const head = (w, holder, terms, note) => put(w, holder, 'promise', { what: 'a pool', terms: { until: '2027-12-31T00:00:00.000Z', ...terms } }, { from: holder.id }, note)
// A pay-in or a payout: a transfer `for` the head, `to_owner` the receiver, naming no instance.
const send = (w, p, to, h, amount, note, state = {}, refs = {}) => put(w, p, 'transfer', { amount, ...state }, { to_owner: to.id, for: h.hash, ...refs }, note)

// ---- 1. A pot of £1,000: a payout signed ahead holds; a second past what is left (vector 21) ----
{
  const w = new World('k3 a payout signed ahead')
  const coop = w.person('coop'), leila = w.person('leila'), achieng = w.person('achieng'), vet = w.person('vet')
  const h = head(w, coop, { backing: gbp(1000) }, 'the coop backs its pool with £1,000')
  const cond = { signal: 'cow_died', by: [vet.id], signers: 1, subject: leila.id }
  const toLeila = send(w, coop, leila, h, gbp(800), 'a payout of £800 to leila, signed ahead on the vet', { condition: cond })
  const toAchieng = send(w, coop, achieng, h, gbp(800), '£800 to achieng')
  ask(w, 'signed ahead', 'Leila\'s payout holds; Achieng\'s is past from the first minute', 'pot', [h, 'held', null],
    { leila: D(true, null, 'held'), achieng: D(false, 'past', null), held: '800', paid_out: '0', left: '200' },
    'folds.md, A pot: It holds from where it is signed, conditioned or not, so a payout signed ahead keeps its place, and a later one that does not fit reads past from the first minute',
    (p) => (!p || p.not_shown ? p : { leila: drawView(toLeila.hash, 'payouts')(p), achieng: drawView(toAchieng.hash, 'payouts')(p), ...sums('held', 'paid_out', 'left')(p) }))
  put(w, vet, 'observe', { kind: 'cow_died' }, { subject: leila.id }, 'the vet signs')
  yes(w, leila, toLeila, 'leila accepts')
  ask(w, 'signed ahead', 'the signal comes and she says yes: it lands', 'pot', [h, 'held', '2030-01-01T00:00:00.000Z'],
    { leila: D(true, null, 'landed'), achieng: D(false, 'past', null), held: '0', paid_out: '800', left: '200' },
    'folds.md, A pot: it lands on the receiver\'s yes and its condition; left is backing plus paid_in less held and paid_out',
    (p) => (!p || p.not_shown ? p : { leila: drawView(toLeila.hash, 'payouts')(p), achieng: drawView(toAchieng.hash, 'payouts')(p), ...sums('held', 'paid_out', 'left')(p) }))
  ask(w, 'signed ahead', 'the pot\'s holder and kind', 'pot', [h, 'held', null], { holder: coop.id, kind: 'GBP', backing: '1000' },
    'folds.md, A pot: whose owner is the holder, whom the head speaks for; The pot\'s kind is the backing\'s',
    (p) => (!p || p.not_shown ? p : { holder: p.holder, kind: p.kind && p.kind.unit, backing: L.v(p.backing) }))
}

// ---- 2. A pot with no backing and pay-ins of two kinds (vector 22) ----
{
  const w = new World('k3 a pot of two kinds')
  const holder = w.person('holder'), ann = w.person('ann'), bea = w.person('bea')
  const h = head(w, holder, {}, 'a pool with no backing')
  for (const [p, a] of [[ann, gbp(10)], [bea, amt(1000, 'KES')]]) { const t = send(w, p, holder, h, a, `${p.label} pays in ${a.value} ${a.unit}`); yes(w, holder, t, `the holder accepts ${p.label}'s pay-in`) }
  const out = send(w, holder, ann, h, gbp(5), 'a payout of £5 to ann')
  ask(w, 'two kinds', 'kind null, the payout takes nothing (unit)', 'pot', [h, 'held', null], { kind: null, payout: D(false, 'unit', null) },
    'folds.md, A pot: with pay-ins of two kinds and no backing it has none, and no payout takes (unit)',
    (p) => (!p || p.not_shown ? p : { kind: p.kind, payout: drawView(out.hash, 'payouts')(p) }))
}

// ---- 3. Pay-ins to_owner the holder count; a marked tin to_holder does not (vector 23) ----
{
  const w = new World('k3 a pay-in and a marked tin')
  const holder = w.person('holder'), ann = w.person('ann'), bea = w.person('bea')
  const h = head(w, holder, {}, 'a pool with no backing')
  const p = send(w, ann, holder, h, gbp(50), 'ann pays in £50')
  yes(w, holder, p, 'the holder accepts')
  const tin = put(w, bea, 'thing', { kind: 'marked tin', marks: [{ scheme: 'tin', value: 'BEA-1' }] }, { of: L.kindOf('tin') }, 'bea\'s marked tin of £30')
  const kept = put(w, bea, 'transfer', {}, { what: tin.hash, to_holder: holder.id, for: h.hash }, 'bea hands the tin to the holder to keep')
  yes(w, holder, kept, 'the holder accepts the tin')
  ask(w, 'pay-in and tin', 'paid_in 50, kind GBP; the tin is no pay-in', 'pot', [h, 'held', null], { kind: 'GBP', paid_in: '50', left: '50' },
    'folds.md, A pot: Money kept apart for its payer is a thing handed to_holder (things.md, Transfers) and is no pay-in; with no backing, the one kind every accepted pay-in shares',
    (r) => (!r || r.not_shown ? r : { kind: r.kind && r.kind.unit, paid_in: L.v(r.paid_in), left: L.v(r.left) }))
  void thing
}

const names = new Set(questions.map((q) => q.world))
if (require.main === module) L.report(questions)
module.exports = { worlds: global.__worlds.filter((w) => w.name.startsWith('k3 ') && names.has(w.name)), questions }
