const crypto = require('crypto')
const { create } = require('./block')
const { generateKeypair, sign } = require('./verify')

/**
 * Create an agent identity.
 *
 * Generates an Ed25519 keypair, creates an actor.agent genesis block,
 * and returns everything needed to operate as an agent.
 *
 * @param {string} name - Human-readable agent name
 * @param {string} operatorHash - Hash of the actor (human/business) that controls this agent
 * @param {object} opts - Optional: { model, capabilities, state }
 * @returns {object} - { block, keypair, sign(block), authorHash }
 */
function createAgent(name, operatorHash, opts = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('FoodBlock Agent: name is required')
  }
  if (!operatorHash || typeof operatorHash !== 'string') {
    throw new Error('FoodBlock Agent: operatorHash is required — every agent must have an operator')
  }

  const keypair = generateKeypair()

  const state = {
    name,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.capabilities ? { capabilities: opts.capabilities } : {}),
    ...(opts.state || {})
  }

  const block = create('actor.agent', state, { operator: operatorHash })

  // Convenience: return a sign function bound to this agent
  const agentSign = (foodblock) => sign(foodblock, block.hash, keypair.privateKey)

  return {
    block,
    keypair,
    authorHash: block.hash,
    sign: agentSign
  }
}

/**
 * Create a draft block on behalf of an operator.
 *
 * Draft blocks have state.draft = true and refs.agent pointing to the agent.
 * The operator can approve by creating an update with draft removed.
 *
 * @param {object} agent - Agent object from createAgent()
 * @param {string} type - Block type
 * @param {object} state - Block state (draft: true is added automatically)
 * @param {object} refs - Block refs (agent ref is added automatically)
 * @returns {object} - { block, signed } where signed is the authentication wrapper
 */
function createDraft(agent, type, state = {}, refs = {}) {
  const draftState = { ...state, draft: true }
  const draftRefs = { ...refs, agent: agent.authorHash }
  const block = create(type, draftState, draftRefs)
  const signed = agent.sign(block)

  return { block, signed }
}

/**
 * Approve a draft block (typically called by the operator, not the agent).
 *
 * Creates a new block that supersedes the draft — same content but with
 * draft removed and refs.updates pointing to the draft.
 *
 * @param {object} draftBlock - The draft block to approve
 * @returns {object} - The approved block (unsigned — operator should sign it)
 */
function approveDraft(draftBlock) {
  const { draft, ...approvedState } = draftBlock.state
  const { agent, ...remainingRefs } = draftBlock.refs

  const approvedRefs = {
    ...remainingRefs,
    updates: draftBlock.hash,
    approved_agent: agent
  }

  return create(draftBlock.type, approvedState, approvedRefs)
}

/**
 * Load an existing agent from saved credentials.
 *
 * @param {string} authorHash - The agent's block hash (its identity)
 * @param {object} keypair - { publicKey, privateKey } as hex strings
 * @returns {object} - { authorHash, keypair, sign(block) }
 */
function loadAgent(authorHash, keypair) {
  if (!authorHash || !keypair || !keypair.privateKey) {
    throw new Error('FoodBlock Agent: authorHash and keypair with privateKey are required')
  }

  const agentSign = (foodblock) => sign(foodblock, authorHash, keypair.privateKey)

  return {
    authorHash,
    keypair,
    sign: agentSign
  }
}

module.exports = { createAgent, createDraft, approveDraft, loadAgent }
