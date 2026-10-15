// The folds (spec/protocol.md §11): a set of blocks read into one answer, the same on every node from the same blocks.
// Every block is first read as 1.6 through aliases.json (all rows). No step reads another author's clock or breaks a
// tie on authority by hash; `now` is only the reader's own clock, for views (expired, until). A block without seq
// counts only as its author's history (identity.cjs `counts`): in an older identity's closed history it counts in
// every fold under the rules it was written in, read through aliases, so an old membership or grant stands.
const { readAs } = require('./aliases.cjs')
const { pastOf, sees, causalOrder, headsAmong, indexOf } = require('./order.cjs')
const { isLive } = require('./grant.cjs')
const { PROTOCOL } = require('./spec.cjs')

const list = (ref) => (Array.isArray(ref) ? ref : ref ? [ref] : [])
const readAll = (blocks) => new Map([...indexOf(blocks).values()].map((block) => [block.hash, readAs(block)]))
const counts = (block, byHash) => require('./identity.cjs').counts(block, byHash)
const earliest = (set, byHash) => set.filter((one) => !set.some((other) => other !== one && sees(one, other, byHash)))

// ---- A promise's stage ----
// Who a block speaks for: a side it names as its author or `as`, or a side whose live grant it acts under.
function speaksAs(block, side, byHash, now) {
  if (!side || !block) return false
  if (block.refs?.author === side || block.refs?.as === side) return true
  const grant = byHash.get(block.refs?.under)
  return Boolean(grant && grant.type === 'grant' && grant.refs?.author === side && (!grant.refs.to || grant.refs.to === block.refs.author) && isLive(grant, byHash, { now }))
}
const decimal = (value) => Number(value)
const amountIn = (amount, unit) => (amount && amount.unit === unit ? decimal(amount.value) : null)
// A decimal string as an exact fraction of whole numbers: '1.25' is 125 / 100.
const fraction = (text) => { const [whole, part = ''] = String(text).split('.'); return { n: BigInt(whole + part), d: 10n ** BigInt(part.length) } }
// n / d rounded to the nearest whole number, halves up (toward +infinity), exactly.
const roundHalfUp = (n, d) => { if (d < 0n) { n = -n; d = -d } const twice = 2n * n + d, den = 2n * d; return twice >= 0n ? twice / den : -((-twice + den - 1n) / den) }
// The total a price comes to for a quantity: money; money per unit, `money.minor` times the quantity over `per`,
// rounded to the nearest minor unit, halves up (§6); or null when it is a share of something measured.
function totalOf(price, quantity) {
  if (!price) return null
  if (Number.isInteger(price.minor)) return { minor: price.minor, currency: price.currency }
  if (price.per && price.money) {
    if (!quantity || quantity.unit !== price.per.unit) return null
    const q = fraction(quantity.value), per = fraction(price.per.value)
    return { minor: Number(roundHalfUp(BigInt(price.money.minor) * q.n * per.d, q.d * per.n)), currency: price.money.currency }
  }
  return null
}

/**
 * A promise's stage, from its first promise and every block in its deal: offered, asked, expired, declined, stopped,
 * accepted, underway, done or reversed. Returns { stage, offer, accept, sides, quantity, total, paid, lines, takers,
 * stopped (occurrences), forks }. Options: `now` (the reader's clock, for expired), `confirmers` (ids whose confirms
 * count a transfer, from the schema's grounds).
 */
function promiseStage(firstBlock, blocks, { now, confirmers = [] } = {}) {
  const byHash = readAll([firstBlock, ...indexOf(blocks).values()])
  const first = byHash.get(firstBlock.hash)
  // The deal: every block naming the first promise in `for`, or answering a block in it (history only where it counts).
  const deal = new Set([first.hash])
  for (let grew = true; grew;) {
    grew = false
    for (const block of byHash.values()) {
      if (deal.has(block.hash) || !counts(block, byHash)) continue
      if (list(block.refs?.for).includes(first.hash) || list(block.refs?.answers).some((hash) => deal.has(hash)) || list(block.refs?.updates).some((hash) => deal.has(hash))) { deal.add(block.hash); grew = true }
    }
  }
  const { from, to } = first.refs
  const offererSide = speaksAs(first, from, byHash, now) ? 'from' : 'to'
  const offerer = first.refs[offererSide], otherSide = offererSide === 'from' ? 'to' : 'from'
  const open = !first.refs[otherSide]
  const sideOf = (block) => (speaksAs(block, from, byHash, now) ? 'from' : speaksAs(block, to, byHash, now) ? 'to' : null)
  // 1. Only blocks a side signed (an open side is anyone, until an accept binds).
  const inDeal = causalOrder([...deal].map((hash) => byHash.get(hash))).filter((block) => block.hash !== first.hash && (sideOf(block) || (open && !speaksAs(block, offerer, byHash, now))))
  const status = (block, word) => block.state?.status === word
  const answersOf = (hash, word) => inDeal.filter((block) => list(block.refs?.answers).includes(hash) && (word === undefined ? block.state?.status === undefined : status(block, word)))
  const byOfferer = (block) => speaksAs(block, offerer, byHash, now)

  // 2. The live offers: the first promise, or the latest counters between the same two sides (crossing counters both stand).
  let live = [first]
  if (!open) for (let next; (next = live.flatMap((offer) => answersOf(offer.hash).filter((counter) => counter.type === 'promise' && sideOf(counter) && sideOf(counter) !== sideOf(offer)))).length;) live = next
  // 6. A binding accept: the other side's accept of a live offer (one to one), unless the offerer declined it; or, for an
  // offer open to many, the offerer's own allocation (its accepted answer to an accept), each seeing the one before.
  const declinedByOfferer = (accept) => answersOf(accept.hash, 'declined').some(byOfferer)
  const takers = [], forks = []
  // To yourself: a promise whose from and to both name its author is accepted when made.
  const toSelf = Boolean(from && from === to && first.refs.author === from)
  let accept = null
  if (toSelf) accept = first
  else if (!open) {
    accept = live.flatMap((offer) => answersOf(offer.hash, 'accepted').filter((block) => sideOf(block) && sideOf(block) !== sideOf(offer) && !declinedByOfferer(block)))[0] || null
  } else {
    const requests = answersOf(first.hash, 'accepted').filter((block) => !byOfferer(block))
    const allocations = inDeal.filter((block) => byOfferer(block) && status(block, 'accepted') && list(block.refs?.answers).some((hash) => requests.some((request) => request.hash === hash)))
    const cap = first.state?.terms?.quantity?.max || first.state?.terms?.quantity
    // The sequencer's allocations form one chain, each seeing the one before. Two that do not see each other prove a
    // lie: neither counts, nor anything after them; only what came before the pair binds.
    let allocated = 0
    for (const allocation of causalOrder(allocations)) {
      const crossed = takers.findIndex((taker) => !sees(allocation, byHash.get(taker.allocation), byHash))
      if (crossed !== -1) { forks.push(...[takers[crossed].allocation, allocation.hash].sort()); takers.length = crossed; break }
      const request = requests.find((one) => list(allocation.refs.answers).includes(one.hash))
      const quantity = allocation.state?.terms?.quantity || request.state?.terms?.quantity
      const q = cap && quantity ? amountIn(quantity, cap.unit) : null
      // What is bound from an offer never exceeds what is offered (invariant 11).
      if (q !== null && allocated + q > decimal(cap.value)) continue
      allocated += q || 0
      takers.push({ who: request.refs.author, request: request.hash, allocation: allocation.hash, quantity: quantity || null })
    }
    if (takers.length) accept = byHash.get(takers[0].allocation)
  }
  const offer = accept && !open && !toSelf ? byHash.get(list(accept.refs.answers)[0]) : live[0]
  // Every name the spec gives (§11, What each fold returns): a field that does not apply is null, or an empty list.
  const result = (stage, more = {}) => ({ stage, stop: null, from: null, offer: offer.hash, accept: accept?.hash || null, sides: { from: from || null, to: to || null }, quantity: null, takers, forks,
    lines: [], total: null, paid: null, stopped: [], ...more })

  // 3. Stopped before: by the offerer (an updates) or the other side (an answers), unless an accept binds over it.
  const stops = inDeal.filter((block) => status(block, 'stopped'))
  const before = stops.filter((block) => block.state.stop === 'before')
  if (before.length && (!accept || before.some((stop) => sees(accept, stop, byHash)))) return result('stopped', { stop: 'before' })
  // 4. Declined by the other side.
  if (!accept && !open && live.some((one) => answersOf(one.hash, 'declined').some((block) => sideOf(block) && sideOf(block) !== sideOf(one)))) return result('declined')
  // 5. No binding accept: offered or asked; expired once the reader's clock passes `expires` (a view).
  if (!accept) {
    const expires = live[0].state?.terms?.expires
    return result(now && expires && now > expires ? 'expired' : offererSide === 'from' ? 'offered' : 'asked')
  }
  // 7, 8. Settling: a giver's transfer counts once the receiver accepts it, or a party the grounds name confirms it.
  const terms = offer.state?.terms || {}
  const chosen = accept.state?.terms?.quantity || takers[0]?.quantity || terms.quantity
  const receiver = (side) => first.refs[side] || (side === otherSide ? takers[0]?.who || accept.refs.author : null)
  const toSide = receiver('to'), fromSide = receiver('from')
  // A confirmer is one given, or one the deal's schema names in its grounds (an id, or circle#role: its holders).
  const schema = byHash.get(first.refs.schema)
  const named = [...confirmers, ...(schema?.state?.grounds?.confirmers || [])].flatMap((who) => {
    const [circle, role] = who.split('#')
    return role ? holdersOf(circleState(circle, byHash), role) : [who]
  })
  const counted = (block, receiverId) => answersOf(block.hash, 'accepted').some((answer) => answer.refs.author === receiverId || answer.refs.as === receiverId)
    || [...byHash.values()].some((other) => list(other.refs?.confirms).includes(block.hash) && named.includes(other.refs.author))
  const transfers = inDeal.filter((block) => block.type === 'transfer' && block.state?.status === undefined)
  // Goods count when they move ownership: to a named receiver once it answers accepted; to an open receiver (a count) on
  // the sequencer's own signature.
  const goods = transfers.filter((block) => !block.state?.money && ((list(block.refs.to_owner).includes(toSide) || list(block.refs.to_holder).includes(toSide)) && counted(block, toSide)
    || (block.state.count !== undefined && !block.refs.to_owner && byOfferer(block) && offererSide === 'from')))
  const pays = transfers.filter((block) => block.state?.money && list(block.refs.to_owner).includes(fromSide) && counted(block, fromSide))
  const refunds = transfers.filter((block) => block.state?.money && list(block.refs.to_owner).includes(toSide) && counted(block, toSide))
  const work = inDeal.filter((block) => (block.type === 'transform' || (block.type === 'observe' && block.state?.kind === 'work')) && sideOf(block) && block.state?.status === undefined)
  // A job is done when the receiving side accepts the work; time, when accepted work covers terms.quantity.
  const acceptedWork = work.filter((block) => counted(block, toSide))
  const moneyFor = (block) => (block.state.split ? block.state.split.filter((part) => part.for === first.hash).reduce((sum, part) => sum + part.money.minor, 0) : block.state.money.minor)
  const paid = pays.reduce((sum, block) => sum + moneyFor(block), 0), back = refunds.reduce((sum, block) => sum + moneyFor(block), 0)
  // Each line (or the whole) is covered when counted transfers move at least its quantity of `what` to the `to` side.
  const lines = terms.lines || [{ id: null, what: offer.refs.what, quantity: chosen, price: terms.price }]
  const moved = (line) => goods.filter((block) => (line.id ? block.state.line === line.id : true)).reduce((sum, block) => {
    const unit = line.quantity?.unit
    const amount = amountIn(block.state.amount, unit)
    if (amount !== null) return sum + amount
    const packs = list(block.refs.what).map((hash) => amountIn(byHash.get(hash)?.state?.pack, unit)).filter((value) => value !== null)
    return sum + (packs.length ? packs.reduce((a, b) => a + b, 0) : Infinity)
  }, 0)
  const lineState = lines.map((line) => ({ id: line.id, needed: line.quantity ? decimal(line.quantity.value) : null, moved: moved(line), total: totalOf(line.price, line.quantity) }))
  const priced = lineState.filter((line) => line.total)
  const total = priced.length ? { minor: priced.reduce((sum, line) => sum + line.total.minor, 0), currency: priced[0].total.currency } : null
  const goodsDone = lines.every((line, i) => !line.what || (lineState[i].needed === null ? lineState[i].moved > 0 : lineState[i].moved >= lineState[i].needed))
  const workDone = terms.quantity && !offer.refs.what ? acceptedWork.reduce((sum, block) => sum + (amountIn(block.state.amount, terms.quantity.unit) || 0), 0) >= decimal(terms.quantity.value) : acceptedWork.length > 0
  const done = goodsDone && (total ? paid >= total.minor : true) && (offer.refs.what || terms.lines ? true : workDone)
  const occurrences = [...new Set(stops.flatMap((block) => block.state.stop?.occurrences || []))].sort()
  const currency = total?.currency || pays.map((block) => block.state.money.currency)[0]
  const more = { quantity: chosen || null, total, paid: total || paid ? { minor: paid, currency } : null,
    lines: lineState.map((line) => ({ id: line.id, needed: line.needed, moved: Number.isFinite(line.moved) ? line.moved : line.needed })), stopped: occurrences }
  // 10. Reversed: a done promise with counted transfers back for it covering what was paid.
  if (done && paid > 0 && back >= paid) return result('reversed', more)
  // 9. Stopped onward, from that block.
  const onward = stops.find((block) => block.state.stop === 'onward')
  if (onward) return result('stopped', { ...more, stop: 'onward', from: onward.hash })
  if (done) return result('done', more)
  return result(goods.length || pays.length || work.length ? 'underway' : 'accepted', more)
}

// ---- A circle: membership and roles ----
/**
 * A circle's members and roles from its member grants, in causal order: { founder, members: { id: { roles, grant,
 * last_counted } }, removed: { id: last_counted } }. A member grant counts if signed as the circle by someone holding
 * admin in the fold of its own causal past; a member holds its roles once their own answer accepts it; roles taken
 * away count at once, roles added once answered. Crossing removals of admins: the admin whose admin grant is earlier
 * in causal order wins (the founder above all); if neither is earlier, both stand. Options: `within` (a block: fold
 * only its causal past).
 */
function circleState(circle, blocks, { within } = {}) {
  const byHash = readAll(blocks)
  const root = byHash.get(circle.hash || circle)
  if (!root) return null
  const id = root.hash, founder = root.refs.author
  // Every member grant and answer naming the circle that counts: with seq, or as its author's history.
  const related = [...byHash.values()].filter((block) => block.type === 'grant' && block.state?.kind === 'member' && list(block.refs?.subject).includes(id) && counts(block, byHash))
  const needed = root.state.removal?.needed || PROTOCOL.circle.removal_default.needed
  const memo = new Map()
  // One pass in causal order: each invitation, answer, change and removal applies where it falls, so a member removed
  // and later invited again is in, by the new grant; a grant once ended stays ended.
  const fold = (set) => {
    const key = set.map((block) => block.hash).sort().join()
    if (memo.has(key)) return memo.get(key)
    const state = { founder, members: { [founder]: { roles: ['admin'], grant: id, last_counted: null } }, removed: {} }
    memo.set(key, state)
    const invitations = new Map(), updates = new Map(), ended = new Set(), held = new Map([[founder, { grant: id, roles: ['admin'] }]])
    const admin = (block) => block.refs.as === id && (pastFold(block).members[block.refs.author]?.roles || []).includes('admin')
    const isStop = (block) => block.state.status === 'stopped' && list(block.refs.updates).length && !list(block.refs.answers).length
    const stops = set.filter((block) => isStop(block) && admin(block))
    const remove = (who, lastCounted) => { state.removed[who] = lastCounted || null; delete state.members[who] }
    // Whose admin grant is earlier in causal order (the circle itself, the founder's, above all).
    const earlier = (a, b) => (a === b || !a || !b ? false : a === id || sees(byHash.get(b), byHash.get(a), byHash))
    const agreed = new Map()
    for (const block of causalOrder(set)) {
      const answered = list(block.refs.answers), updated = list(block.refs.updates)
      if (!answered.length && !updated.length && block.state.status === undefined) {
        if (admin(block)) invitations.set(block.hash, { to: block.refs.to || null, roles: block.state.roles || [] })
      } else if (answered.length) {
        const grant = answered.find((hash) => invitations.has(hash) || updates.has(hash))
        if (!grant) continue
        const target = invitations.get(grant) || updates.get(grant), who = block.refs.author
        if (target.to && target.to !== who) continue
        const current = state.members[who]
        if (block.state.status === 'accepted') {
          if (target.update) { if (current && current.grant === target.grant && !ended.has(target.grant)) current.roles = [...new Set([...current.roles, ...target.added])] }
          else if (!ended.has(grant)) { state.members[who] = { roles: [...target.roles], grant, last_counted: null }; held.set(who, state.members[who]); delete state.removed[who] }
        } else if (['stopped', 'declined'].includes(block.state.status) && who !== founder && current && current.grant === (target.update ? target.grant : grant)) {
          ended.add(current.grant); remove(who, block.state.last_counted)
        }
      } else if (updated.length && admin(block)) {
        const grant = updated.find((hash) => invitations.has(hash))
        if (!grant || ended.has(grant)) continue
        const who = Object.keys(state.members).find((member) => state.members[member].grant === grant) || null
        if (isStop(block)) {
          // An invitation not yet answered simply ends.
          if (!who) { ended.add(grant); continue }
          if (who === founder) continue
          // Removing an admin takes `state.removal.needed` other admins (default 1); a member, one admin.
          const agreeing = (agreed.get(grant) || new Set()).add(block.refs.author)
          agreed.set(grant, agreeing)
          if (state.members[who].roles.includes('admin') && [...agreeing].filter((by) => by !== who).length < needed) continue
          // Crossing removals of admins: the one whose admin grant is earlier wins; if neither is, both stand.
          const remover = block.refs.author
          const rival = stops.find((other) => other.refs.author === who && list(other.refs.updates).includes(held.get(remover)?.grant) && !sees(other, block, byHash) && !sees(block, other, byHash))
          if (rival && remover !== founder && earlier(held.get(who)?.grant, held.get(remover)?.grant)) continue
          ended.add(grant); remove(who, block.state.last_counted)
        } else if (block.state.roles && who) {
          const before = state.members[who].roles, after = block.state.roles
          state.members[who].roles = before.filter((role) => after.includes(role))
          updates.set(block.hash, { update: true, grant, to: who, added: after.filter((role) => !before.includes(role)) })
        }
      }
    }
    return state
  }
  const pastFold = (block) => { const past = pastOf(block, byHash); return fold(related.filter((one) => past.has(one.hash))) }
  return within ? pastFold(byHash.get(within.hash) || within) : fold(related)
}

/** The holders of a role in a circle (the members holding it), sorted. */
const holdersOf = (state, role) => Object.entries(state?.members || {}).filter(([, member]) => member.roles.includes(role)).map(([who]) => who).sort()

/**
 * Whether a block may be signed as a circle: its author holds, in the fold of its causal past, `role` if one is named,
 * else a role the circle actor lists in `state.signers` (default [admin]).
 */
function mayActAs(block, circle, blocks, role) {
  const state = circleState(circle, blocks, { within: block })
  const root = readAs(indexOf(blocks).get(circle.hash || circle) || circle)
  const member = state?.members[block.refs.author]
  const roles = role ? [role] : root?.state?.signers || PROTOCOL.circle.signers_default
  return Boolean(member && member.roles.some((held) => roles.includes(held)))
}

// ---- Audience: members then ----
/** Who a circle (or `circle#role`) in a block's audience means: the members (or holders) in the fold of the circle's grants within that block's causal past. */
function membersThen(block, recipient, blocks) {
  const [circle, role] = String(recipient).split('#')
  const byHash = indexOf(blocks)
  if (!byHash.has(circle)) return []
  const state = circleState(circle, byHash, { within: block })
  return role ? holdersOf(state, role) : Object.keys(state.members).sort()
}

// ---- Things: who owns an instance, and where it is now ----
/**
 * Who owns an instance: the `to_owner` of its last counted ownership transfer, else its maker. A transfer of ownership
 * counts only if signed by the owner the previous counted transfer named (or the maker, for the first), with that
 * transfer in its causal past. A part (state.amount) leaves ownership where it is. Two that do not see each other
 * prove a lie: { owner, transfers, conflict }.
 */
function ownership(instance, blocks) {
  const byHash = readAll([instance, ...indexOf(blocks).values()])
  const thing = byHash.get(instance.hash || instance)
  let owner = thing.refs.author, last = null
  // A transfer to a named receiver moves ownership once the receiver answers it accepted; to an open receiver (a count),
  // on the owner's own signature, to nobody named.
  const accepted = (transfer) => [...byHash.values()].some((block) => block.type === 'transfer' && block.state?.status === 'accepted' && counts(block, byHash) && list(block.refs?.answers).includes(transfer.hash) && list(transfer.refs.to_owner).includes(block.refs.author))
  const transfers = [], candidates = [...byHash.values()].filter((block) => block.type === 'transfer' && counts(block, byHash) && block.state?.status === undefined && list(block.refs.what).includes(thing.hash) && block.state?.amount === undefined
    && (block.refs?.to_owner ? accepted(block) : block.state?.count !== undefined))
  for (;;) {
    const next = earliest(candidates.filter((block) => !transfers.includes(block.hash) && (block.refs.author === owner || block.refs.as === owner) && (!last || sees(block, last, byHash))), byHash)
    if (next.length > 1) return { owner, transfers, conflict: next.map((block) => block.hash).sort() }
    if (!next.length) return { owner, transfers, conflict: null }
    last = next[0]; transfers.push(last.hash); owner = list(last.refs.to_owner)[0] || null
    if (!owner) return { owner, transfers, conflict: null }
  }
}
const ownerOf = (instance, blocks) => ownership(instance, blocks).owner

/** Who receives a bearer promise (refs.to names a thing): whoever owns it now; otherwise refs.to itself. */
function receiverOf(promise, blocks) {
  const byHash = indexOf(blocks), to = promise.refs?.to
  return byHash.get(to)?.type === 'thing' ? ownerOf(byHash.get(to), byHash) : to || null
}

/**
 * Where a thing is now: the `to_place` of its latest counted move (by its owner, or a holder its owner named), else
 * its own refs.place; a place that is a thing is wherever that thing is (stopping at a repeat). Two moves that do not
 * see each other give both places. Returns a sorted list of hashes.
 */
function whereNow(thing, blocks, seen = new Set()) {
  const byHash = indexOf(blocks), self = readAs(byHash.get(thing.hash || thing) || thing)
  if (seen.has(self.hash)) return [self.hash]
  seen.add(self.hash)
  const owner = ownerOf(self, byHash)
  const read = readAll(byHash)
  const all = [...read.values()].filter((block) => block.type === 'transfer' && block.state?.status === undefined && list(block.refs?.what).includes(self.hash) && counts(block, read))
  const holders = new Set([owner, ...all.filter((block) => block.refs.author === owner).flatMap((block) => list(block.refs.to_holder))])
  const moves = all.filter((block) => block.refs.to_place && holders.has(block.refs.author))
  const places = moves.length ? [...new Set(headsAmong(moves).flatMap((block) => list(block.refs.to_place)))] : list(self.refs.place)
  if (!places.length) return []
  return [...new Set(places.flatMap((place) => {
    const at = byHash.get(place)
    if (!at || readAs(at).type !== 'thing') return [place]
    const further = whereNow(at, byHash, seen)
    return further.length ? further : [place]
  }))].sort()
}

// ---- A successor's trigger (§7) ----
/**
 * Where a successor grant's trigger stands: the needed witnesses' event observes (each a witness's observe naming the
 * grant in refs.under), less those the person (a live key, or the recovery key) defeats before it fires. It fires
 * `wait` after the needed-th event arrived on this node (`arrivedAt`), on the reader's own clock (`now`); no author's
 * clock is read. Returns { events, cancelled, since, fires, fired }.
 */
function successorState(grant, blocks, { now, arrivedAt } = {}) {
  const { signedByAuthor } = require('./identity.cjs')
  const { addDuration } = require('./grant.cjs')
  const byHash = indexOf(blocks), person = grant.refs.author, witnesses = grant.state.witnesses || []
  const events = [...byHash.values()].filter((block) => block.type === 'observe' && block.refs?.under === grant.hash && witnesses.includes(block.refs.author) && counts(block, byHash))
  const arrived = (block) => arrivedAt?.(block.hash) || null
  const defeats = [...byHash.values()].filter((block) => block.refs?.author === person && list(block.refs?.defeats).length && signedByAuthor(block, byHash))
  // A defeat cancels an event only if it arrived before the trigger fires; cancelling moves the trigger, so read until it settles.
  const read = (until) => {
    const cancelled = [], standing = []
    let since = null, fires = null
    for (const event of [...events].sort((a, b) => String(arrived(a)).localeCompare(String(arrived(b))))) {
      if (defeats.some((block) => list(block.refs.defeats).includes(event.hash) && (!until || !arrived(block) || arrived(block) < until))) { cancelled.push(event.hash); continue }
      if (!standing.some((other) => other.refs.author === event.refs.author)) standing.push(event)
      if (standing.length === grant.state.needed && !since) { since = arrived(event); fires = since ? addDuration(since, grant.state.wait) : null }
    }
    return { cancelled, standing, since, fires }
  }
  let state = read(null)
  for (let i = 0; i <= events.length; i++) { const next = read(state.fires); if (next.fires === state.fires) { state = next; break } state = next }
  const { cancelled, standing, since, fires } = state
  return { events: standing.map((event) => event.hash).sort(), cancelled: cancelled.sort(), since, fires, fired: Boolean(fires && now && now >= fires) }
}

// ---- A circle's key, by epoch (§8) ----
/**
 * A circle's encryption key now: the key grants signed as the circle by an admin (in the fold of each grant's causal
 * past), each with state.epoch one higher. Two rekeys in one epoch both open; the next settles. Returns { epoch, keys,
 * grants } (epoch 0 is the key in the circle's actor).
 */
function circleKey(circle, blocks) {
  const byHash = readAll(blocks), root = byHash.get(circle.hash || circle)
  const rekeys = [...byHash.values()].filter((block) => block.type === 'grant' && block.state?.kind === 'key' && block.refs?.as === root.hash && Number.isInteger(block.state?.epoch) && block.state.public_key_encrypt && counts(block, byHash))
    .filter((block) => mayActAs(block, root, byHash, 'admin'))
  let epoch = 0, open = [{ hash: root.hash, key: root.state.public_key_encrypt }]
  for (let next = 1; ; next++) {
    // Epoch n names epoch n-1 in after (epoch 0 is the circle itself).
    const these = rekeys.filter((block) => block.state.epoch === next && open.some((one) => list(block.refs.after).includes(one.hash)))
    if (!these.length) break
    epoch = next; open = these.map((block) => ({ hash: block.hash, key: block.state.public_key_encrypt }))
  }
  return { epoch, keys: open.map((one) => one.key).sort(), grants: open.map((one) => one.hash).sort() }
}

// ---- A secret ballot (§8) ----
/** Whether a voter's commitment is among those the named counter signed as counted (`state.counted`). */
const countedIn = (result, commitment, counter) => Boolean(result?.refs?.author === counter && list(result.state?.counted).includes(commitment))

/** A record's sequencer: { key } named by its first block's state.sequencer, else { author } (the key that signed it). */
const sequencerOf = (record) => (record.state?.sequencer ? { key: record.state.sequencer } : { author: record.refs?.author })

module.exports = { promiseStage, circleState, holdersOf, mayActAs, membersThen, ownership, ownerOf, receiverOf, whereNow, successorState, circleKey, countedIn, sequencerOf }
