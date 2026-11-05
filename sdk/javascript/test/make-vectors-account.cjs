// Adds to spec/vectors.json the cases of `account_of` (promises.md, Where to pay me): a person's own signed word of where money to them goes.
// `node test/make-vectors-account.cjs`, after `node scripts/build-wasm.cjs`. Idempotent. Each expectation is written by hand from the spec text; the Rust core
// must give it and so must the oracle (spec/oracle).
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { fb, keyOf, story, door, LATER } = kit

const account = (name, who, held, expect) => door(`account: ${name}`, 'account_of', [who.id, held], { expect, exact: true })
const word = (s, who, destination, extra = {}) => s.say(who, 'observe', { kind: 'account', ...(destination === null ? {} : { destination }) }, extra)

{
  const s = story(), mill = s.person('ac-mill'), her = s.person('ac-her')
  account('no account word: nothing is read', mill, s.held, null)
  const first = word(s, mill, 'sort 20-00-00, account 1234')
  account('their own word is their account: who and where, as one pair', mill, s.held, { who: mill.id, destination: 'sort 20-00-00, account 1234', hash: first.hash, at: first.state.at })
  account('and it is no one else\'s: the same blocks read for another person name none', her, s.held, null)
  const second = word(s, mill, 'sort 40-00-00, account 9876')
  account('new details are a new word: the head is the one no other of theirs sees the end of', mill, s.held, { who: mill.id, destination: 'sort 40-00-00, account 9876', hash: second.hash, at: second.state.at })
  word(s, mill, null)
  account('a head with no destination ends the account', mill, s.held, null)
}
{
  // a destination anywhere but their own account word names no account
  const s = story(), mill = s.person('ad-mill'), her = s.person('ad-her')
  s.say(her, 'observe', { kind: 'account', destination: 'her account, said for him' }, { for: mill.id })
  s.say(mill, 'observe', { kind: 'message', destination: 'account 1', text: 'pay here' })
  account('a destination in a message, a deal, or another person\'s word names no account', mill, s.held, null)
  account('and another person\'s account word names no account for him', her, s.held, { who: her.id, destination: 'her account, said for him', hash: s.held.find((b) => b.state.kind === 'account').hash, at: s.held.find((b) => b.state.kind === 'account').state.at })
}
{
  // a fork (one key naming one prev twice) counts for nothing (folds.md, A fork is a burden): the account stays what it was before it
  const s = story(), mill = s.person('ae-mill')
  const base = word(s, mill, 'account A')
  const left = s.raw(mill, 'observe', { kind: 'account', destination: 'account B' }, { updates: base.hash })
  // the second head is signed by hand with the same prev and seq as the first: one key naming one prev twice is a fork
  const state = { ...left.state, destination: 'account C' }, refs = { ...left.refs }
  const right = s.keep({ hash: fb.hash('observe', state, refs), type: 'observe', state, refs, signature: fb.sign({ type: 'observe', state, refs }, keyOf('ae-mill').private_key) })
  account('a fork of their key counts for nothing: the account stays what it was before the fork', mill, s.held, { who: mill.id, destination: 'account A', hash: base.hash, at: base.state.at })
  void left; void right
}
{
  // a word signed under a grant or as a circle speaks for someone else: it names no account for its author, nor for the grantor
  const s = story(), pat = s.person('af-pat'), bot = s.person('af-bot', { kind: 'agent' })
  const g = s.say(pat, 'grant', { kind: 'errands', scope: { acts: ['observe.account'], parties: [], until: LATER } }, { to: bot.id })
  s.say(bot, 'observe', { kind: 'account', destination: 'the agent\'s guess' }, { under: g.hash })
  account('an agent\'s word under her grant is not her account (her own signature says where she is paid)', pat, s.held, null)
  account('nor does it name one for the agent', bot, s.held, null)
}

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
