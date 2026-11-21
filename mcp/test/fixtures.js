// Test fixtures only: fictional people whose keys live HERE, in the test, as her own device's would. A door is never given these keys: it gets a
// person's public side (id, genesis, chain) and takes back signatures.
import fb from '@foodxdev/foodblock'

const at = () => new Date().toISOString()

/** A fictional person: keys (the test's "device"), genesis, chain. */
export function testPerson(kind = 'person') {
  const keys = fb.generateKeypair()
  const genesis = fb.identity.genesis(keys, { kind, at: at(), audience: 'public' })
  return { keys, genesis, chain: [genesis], id: genesis.hash }
}
/** What a door may be given of a person: no key. */
export const publicSide = (who) => ({ id: who.id, genesis: who.genesis, chain: who.chain.slice() })
/**
 * Her device taps a draft: the door shows the block, the device signs exactly that, the door takes the signature. Returns the door's answer.
 * (Between the door and the device the block travels as it does on the approval page.)
 */
export function tap(door, draftId, who) {
  const shown = door.signing(draftId)
  if (!shown) return { ok: false, reason: 'nothing to sign' }
  const result = door.approve(draftId, { signature: fb.sign(shown.block, who.keys.private_key) })
  if (result.ok) who.chain.push(door.node.get(result.block))
  return result
}

/** A software passkey: what a platform authenticator does with a challenge (WebAuthn get), for a p256 key the test holds as her device. */
export async function passkeyAnswer(challenge, keys, origin = 'http://localhost') {
  const { createHash, createPrivateKey, createPublicKey, sign } = await import('node:crypto')
  const rp = createHash('sha256').update(new URL(origin).hostname).digest()
  const authenticatorData = Buffer.concat([rp, Buffer.from([0x05]), Buffer.alloc(4, 1)])
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }))
  const { x, y } = createPublicKey({ key: Buffer.from(keys.public_key_sign, 'hex'), format: 'der', type: 'spki' }).export({ format: 'jwk' })
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x, y, d: Buffer.from(keys.private_key, 'hex').toString('base64url') }, format: 'jwk' })
  const signature = sign('sha256', Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]), key)
  return { authenticatorData: authenticatorData.toString('hex'), clientDataJSON: clientDataJSON.toString('hex'), signature: signature.toString('hex') }
}
