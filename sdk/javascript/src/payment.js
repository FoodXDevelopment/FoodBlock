/**
 * FoodBlock Payment Settlement Chain (Implementation Paper §1)
 *
 * Settlement flow: draft order → payment authorization → confirmed order
 *                  → capture → (optional refund)
 *
 * Tab flow: open tab → add items → capture → close
 */

const { create, update } = require('./block')

/**
 * Create a payment authorization block.
 *
 * @param {string} orderHash - Hash of the order being paid for
 * @param {string} buyerHash - Hash of the buyer actor
 * @param {object} opts - { adapter, adapter_ref, amount, currency }
 * @returns {object} The payment FoodBlock
 */
function authorize(orderHash, buyerHash, opts = {}) {
  if (!orderHash) throw new Error('FoodBlock: orderHash is required')
  if (!buyerHash) throw new Error('FoodBlock: buyerHash is required')

  return create('transfer.payment', {
    status: 'authorized',
    adapter: opts.adapter || 'stripe',
    adapter_ref: opts.adapter_ref,
    amount: opts.amount,
    currency: opts.currency || 'GBP'
  }, {
    order: orderHash,
    buyer: buyerHash
  })
}

/**
 * Capture a previously authorized payment.
 *
 * @param {string} authHash - Hash of the authorization block
 * @param {object} [opts] - { adapter_ref, amount (for partial capture) }
 * @returns {object} The capture FoodBlock
 */
function capture(authHash, opts = {}) {
  if (!authHash) throw new Error('FoodBlock: authHash is required')

  const state = { status: 'captured' }
  if (opts.adapter_ref) state.adapter_ref = opts.adapter_ref
  if (opts.amount !== undefined) state.amount = opts.amount
  if (opts.captured_at) state.captured_at = opts.captured_at

  return update(authHash, 'transfer.payment', state)
}

/**
 * Refund a captured payment (full or partial).
 *
 * @param {string} captureHash - Hash of the capture block
 * @param {object} opts - { amount, reason, adapter_ref }
 * @returns {object} The refund FoodBlock
 */
function refund(captureHash, opts = {}) {
  if (!captureHash) throw new Error('FoodBlock: captureHash is required')

  const state = { status: 'refunded' }
  if (opts.amount !== undefined) state.amount = opts.amount
  if (opts.reason) state.reason = opts.reason
  if (opts.adapter_ref) state.adapter_ref = opts.adapter_ref

  return update(captureHash, 'transfer.payment', state)
}

/**
 * Open a tab (pre-authorized payment for walk-in commerce).
 *
 * @param {string} buyerHash - Hash of the buyer
 * @param {string} venueHash - Hash of the venue
 * @param {object} opts - { adapter, adapter_ref, max_amount, currency }
 * @returns {object} The tab FoodBlock
 */
function openTab(buyerHash, venueHash, opts = {}) {
  if (!buyerHash) throw new Error('FoodBlock: buyerHash is required')
  if (!venueHash) throw new Error('FoodBlock: venueHash is required')

  return create('transfer.tab', {
    status: 'open',
    adapter: opts.adapter || 'stripe',
    adapter_ref: opts.adapter_ref,
    max_amount: opts.max_amount,
    currency: opts.currency || 'GBP',
    items: []
  }, {
    buyer: buyerHash,
    venue: venueHash
  })
}

/**
 * Add an item to an open tab.
 *
 * @param {object} tabBlock - The current tab block
 * @param {object} item - { name, price, quantity, product_hash }
 * @returns {object} Updated tab block
 */
function addToTab(tabBlock, item) {
  if (!tabBlock || !tabBlock.hash) throw new Error('FoodBlock: tabBlock is required')
  if (!item || !item.name) throw new Error('FoodBlock: item with name is required')

  const items = [...(tabBlock.state.items || []), item]
  const total = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0)

  return update(tabBlock.hash, 'transfer.tab', {
    ...tabBlock.state,
    items,
    running_total: total,
    status: 'open'
  })
}

/**
 * Close a tab (capture the final amount).
 *
 * @param {object} tabBlock - The current tab block
 * @param {object} [opts] - { tip, adapter_ref }
 * @returns {object} Closed tab block
 */
function closeTab(tabBlock, opts = {}) {
  if (!tabBlock || !tabBlock.hash) throw new Error('FoodBlock: tabBlock is required')

  const items = tabBlock.state.items || []
  const subtotal = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0)
  const tip = opts.tip || 0
  const total = subtotal + tip

  return update(tabBlock.hash, 'transfer.tab', {
    ...tabBlock.state,
    status: 'closed',
    subtotal,
    tip,
    total,
    closed_at: new Date().toISOString(),
    ...(opts.adapter_ref ? { adapter_ref: opts.adapter_ref } : {})
  })
}

module.exports = { authorize, capture, refund, openTab, addToTab, closeTab }
