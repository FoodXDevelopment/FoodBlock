// The commitment (spec/protocol.md §9): the one privacy primitive. A salted hash, SHA-256 of the salt's hex followed by
// the value, as UTF-8. The salt (or the salt and the value) travels beside the block only to whoever it is for, in
// their own copy (`reveals`). A salt is fresh per block per recipient, never reused. The audience, personal fields,
// for_whom, customers in business blocks and secret ballots all use it.
const crypto = require('crypto')

/** 16 random bytes, hex: a salt, or a block's nonce. */
const newSalt = () => crypto.randomBytes(16).toString('hex')

/** The commitment to a value under a salt. */
const saltedHash = (saltHex, value) => crypto.createHash('sha256').update(String(saltHex) + String(value), 'utf8').digest('hex')

/**
 * An audience for these recipients (people, circles, `circle#role`): { audience: sorted commitments, salts: { recipient:
 * salt } }. Each recipient gets a fresh salt unless one is given (only to reproduce a vector).
 */
function commit(recipients, salts = {}) {
  const who = [...new Set(recipients)]
  if (!who.length || who.some((one) => typeof one !== 'string' || !one)) throw new Error('audience: an audience names at least one recipient')
  const given = Object.fromEntries(who.map((one) => [one, salts[one] || newSalt()]))
  return { audience: [...new Set(who.map((one) => saltedHash(given[one], one)))].sort(), salts: given }
}

/** Whether a recipient holding this salt finds itself in a block's audience. */
const findsSelf = (block, recipient, saltHex) => Array.isArray(block?.state?.audience) && Boolean(saltHex) && block.state.audience.includes(saltedHash(saltHex, recipient))

/** The reveal a recipient's copy carries for its audience entry: { salt, value } (its own id). */
const revealFor = (salts, recipient) => ({ salt: salts[recipient], value: recipient })

module.exports = { newSalt, saltedHash, commit, findsSelf, revealFor }
