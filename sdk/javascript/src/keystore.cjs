// Keys on the person's own device (spec/protocol.md §1: every block is signed by its author, on their device). Their
// private key is kept locked with a recovery code only they hold: if the device is lost, the code and the locked key
// (which can be stored anywhere, even on a server that cannot read it) give their key back. The code is random
// characters, grouped to be written down; the lock is scrypt and AES-256-GCM.
const crypto = require('crypto')

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I to misread
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function recoveryCode(groups = 6) {
  const bytes = crypto.randomBytes(groups * 4)
  const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('')
  return chars.match(/.{4}/g).join('-')
}

const normal = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// the shortest code that locks a key: a recovery code is 24 characters; a shorter one is guessable offline from the locked key
const MIN_CODE = 24

function lock(privateKeyHex, code) {
  if (normal(code).length < MIN_CODE) throw new Error(`keystore: a recovery code is at least ${MIN_CODE} letters and digits`)
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(String(privateKeyHex))) throw new Error('keystore: the key to lock is hexadecimal')
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(normal(code), salt, 32, SCRYPT)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  const sealed = Buffer.concat([cipher.update(Buffer.from(privateKeyHex, 'hex')), cipher.final()])
  return { v: 1, kdf: 'scrypt', cipher: 'aes-256-gcm', salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), sealed: sealed.toString('hex') }
}

function unlock(locked, code) {
  if (!normal(code)) throw new Error('keystore: that recovery code does not open this key')
  // the tag is exactly 16 bytes: a shorter one would open the lock with fewer bits of proof
  if (!locked || !/^[0-9a-f]{32}$/.test(String(locked.tag))) throw new Error('keystore: that recovery code does not open this key')
  const key = crypto.scryptSync(normal(code), Buffer.from(locked.salt, 'hex'), 32, SCRYPT)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(locked.iv, 'hex'), { authTagLength: 16 })
  decipher.setAuthTag(Buffer.from(locked.tag, 'hex'))
  try { return Buffer.concat([decipher.update(Buffer.from(locked.sealed, 'hex')), decipher.final()]).toString('hex') }
  catch { throw new Error('keystore: that recovery code does not open this key') }
}

module.exports = { recoveryCode, lock, unlock }
