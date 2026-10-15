// The commitment (modules/privacy.md): the one privacy primitive, a salted hash. The rules run in the Rust core.
const { call } = require('./core.cjs')

/** 16 random bytes, hex: a salt, or a block's nonce. */
const newSalt = () => call('new_salt')
/** The commitment to a value under a salt. */
const saltedHash = (saltHex, value, suite = 'std') => call('salted_hash', String(saltHex), String(value), suite)
/** An audience for these recipients: { audience: sorted commitments, salts: { recipient: salt } }. */
const commit = (recipients, salts = {}, suite = 'std') => call('commit', [...recipients], salts, suite)
/** Whether a recipient holding this salt finds itself in a block's audience. */
const findsSelf = (block, recipient, saltHex) => call('finds_self', block || null, String(recipient), saltHex ? String(saltHex) : '')
/** The reveal a recipient's copy carries for its audience entry: { salt, value } (its own id). */
const revealFor = (salts, recipient) => call('reveal_for', salts, recipient)

module.exports = { newSalt, saltedHash, commit, findsSelf, revealFor }
