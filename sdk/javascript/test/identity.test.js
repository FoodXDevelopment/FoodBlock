const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createIdentity, encryptKeystore, decryptKeystore, rotateKeys, createRecoveryBlock } = require('../src/identity')

describe('createIdentity', () => {
  it('creates an actor block with signing and encryption keys', () => {
    const id = createIdentity('Alice', 'password123')
    assert.equal(id.actorBlock.type, 'actor')
    assert.ok(id.actorBlock.state.public_key_sign)
    assert.ok(id.actorBlock.state.public_key_encrypt)
    assert.ok(id.actorBlock.hash)
  })

  it('returns a signed actor block', () => {
    const id = createIdentity('Bob', 'password456')
    assert.ok(id.signedActor.signature)
    assert.equal(id.signedActor.author_hash, id.actorBlock.hash)
  })

  it('returns an encrypted keystore', () => {
    const id = createIdentity('Carol', 'password789')
    assert.ok(id.keystore.encrypted_keys)
    assert.ok(id.keystore.key_derivation)
    assert.equal(id.keystore.key_derivation.algorithm, 'PBKDF2')
    assert.ok(id.keystore.nonce)
    assert.ok(id.keystore.device_id)
  })

  it('returns public and private keys', () => {
    const id = createIdentity('Dave', 'pass')
    assert.ok(id.publicKeys.sign)
    assert.ok(id.publicKeys.encrypt)
    assert.ok(id.privateKeys.sign)
    assert.ok(id.privateKeys.encrypt)
  })

  it('throws on missing name', () => {
    assert.throws(() => createIdentity('', 'pass'), /name is required/)
  })

  it('throws on missing password', () => {
    assert.throws(() => createIdentity('Eve', ''), /password is required/)
  })
})

describe('encryptKeystore / decryptKeystore', () => {
  it('round-trips keys through encryption', () => {
    const keys = { sign_private: 'abc123', encrypt_private: 'def456' }
    const keystore = encryptKeystore(keys, 'mypassword', 'device-1')
    const decrypted = decryptKeystore(keystore, 'mypassword')
    assert.deepEqual(decrypted, keys)
  })

  it('fails with wrong password', () => {
    const keys = { sign_private: 'abc123' }
    const keystore = encryptKeystore(keys, 'correct', 'device-1')
    assert.throws(() => decryptKeystore(keystore, 'wrong'))
  })
})

describe('rotateKeys', () => {
  it('creates a rotation block signed by old key', () => {
    const id = createIdentity('Frank', 'pass')
    const rotation = rotateKeys(
      id.actorBlock.hash,
      id.privateKeys.sign,
      id.publicKeys.sign,
      'scheduled'
    )
    assert.equal(rotation.rotationBlock.type, 'observe.key_rotation')
    assert.equal(rotation.rotationBlock.state.old_public_key, id.publicKeys.sign)
    assert.ok(rotation.rotationBlock.state.new_public_key)
    assert.notEqual(rotation.rotationBlock.state.new_public_key, id.publicKeys.sign)
    assert.equal(rotation.rotationBlock.refs.actor, id.actorBlock.hash)
  })

  it('creates a signed rotation block', () => {
    const id = createIdentity('Grace', 'pass')
    const rotation = rotateKeys(id.actorBlock.hash, id.privateKeys.sign, id.publicKeys.sign)
    assert.ok(rotation.signedRotation.signature)
  })

  it('creates an updated actor block with new keys', () => {
    const id = createIdentity('Heidi', 'pass')
    const rotation = rotateKeys(id.actorBlock.hash, id.privateKeys.sign, id.publicKeys.sign)
    assert.equal(rotation.newActorBlock.type, 'actor')
    assert.equal(rotation.newActorBlock.refs.updates, id.actorBlock.hash)
    assert.equal(rotation.newActorBlock.state.public_key_sign, rotation.newKeys.sign.publicKey)
  })

  it('returns new signing and encryption keys', () => {
    const id = createIdentity('Ivan', 'pass')
    const rotation = rotateKeys(id.actorBlock.hash, id.privateKeys.sign, id.publicKeys.sign)
    assert.ok(rotation.newKeys.sign.publicKey)
    assert.ok(rotation.newKeys.sign.privateKey)
    assert.ok(rotation.newKeys.encrypt.publicKey)
    assert.ok(rotation.newKeys.encrypt.privateKey)
  })
})

describe('createRecoveryBlock', () => {
  it('creates an observe.key_recovery block', () => {
    const block = createRecoveryBlock('actor_hash', 'device-2', 'password_backup')
    assert.equal(block.type, 'observe.key_recovery')
    assert.equal(block.state.device_id, 'device-2')
    assert.equal(block.state.method, 'password_backup')
    assert.equal(block.refs.actor, 'actor_hash')
    assert.ok(block.state.recovered_at)
  })
})
