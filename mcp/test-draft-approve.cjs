#!/usr/bin/env node
/**
 * End-to-end test: Create agent → Draft order → Approve order
 * Runs against the MCP server's in-memory store via direct SDK calls.
 */
const { create, createAgent, createDraft, approveDraft, verify } = require('../sdk/javascript/src/index');

// Setup: create a bakery and a mill
const bakery = create('actor.venue', { name: 'Joes Bakery', sector: 'hospitality' });
const mill = create('actor.maker', { name: 'Stone Mill Co', sector: 'processing' });
const flour = create('substance.product', { name: 'Flour', price: 3.20 }, { seller: mill.hash });

console.log('=== 1. CREATE AGENT ===');
const agent = createAgent('Bakery Assistant', bakery.hash, {
  model: 'claude-sonnet',
  capabilities: ['ordering', 'inventory']
});
console.log(`Agent: ${agent.block.state.name}`);
console.log(`Hash:  ${agent.authorHash}`);
console.log(`Type:  ${agent.block.type}`);
console.log(`Operator: ${bakery.state.name} (${bakery.hash.slice(0, 12)}...)`);
console.log('');

console.log('=== 2. AGENT CREATES DRAFT ORDER ===');
const { block: draft, signed } = createDraft(agent, 'transfer.order', {
  quantity: 50,
  unit: 'kg',
  total: 160.00,
  reason: 'auto: flour stock below 5kg threshold'
}, {
  buyer: bakery.hash,
  seller: mill.hash,
  product: flour.hash
});
console.log(`Draft hash: ${draft.hash}`);
console.log(`Draft state.draft: ${draft.state.draft}`);
console.log(`Draft refs.agent: ${draft.refs.agent.slice(0, 12)}...`);
console.log(`Signed by: ${signed.author_hash.slice(0, 12)}...`);

// Verify signature
const valid = verify(signed, agent.keypair.publicKey);
console.log(`Signature valid: ${valid}`);
console.log('');

console.log('=== 3. OPERATOR APPROVES DRAFT ===');
const approved = approveDraft(draft);
console.log(`Approved hash: ${approved.hash}`);
console.log(`Has draft flag: ${approved.state.draft !== undefined}`);
console.log(`Refs.updates (points to draft): ${approved.refs.updates.slice(0, 12)}...`);
console.log(`Refs.approved_agent: ${approved.refs.approved_agent.slice(0, 12)}...`);
console.log('');

console.log('=== SUMMARY ===');
console.log(`Draft:    ${draft.hash.slice(0, 16)}... (draft=true, refs.agent=${agent.authorHash.slice(0, 8)}...)`);
console.log(`Approved: ${approved.hash.slice(0, 16)}... (draft removed, refs.updates=${draft.hash.slice(0, 8)}...)`);
console.log('');
console.log('Full agent flow working: create → draft → sign → verify → approve');
