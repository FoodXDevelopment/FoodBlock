const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { authorize, capture, refund, openTab, addToTab, closeTab } = require('../src/payment')

describe('payment settlement chain', () => {
  it('creates an authorization block', () => {
    const auth = authorize('order_hash', 'buyer_hash', {
      adapter: 'stripe',
      adapter_ref: 'pi_123',
      amount: 4.50,
      currency: 'GBP'
    })
    assert.equal(auth.type, 'transfer.payment')
    assert.equal(auth.state.status, 'authorized')
    assert.equal(auth.state.adapter, 'stripe')
    assert.equal(auth.state.adapter_ref, 'pi_123')
    assert.equal(auth.state.amount, 4.5)
    assert.equal(auth.refs.order, 'order_hash')
    assert.equal(auth.refs.buyer, 'buyer_hash')
  })

  it('captures an authorized payment', () => {
    const auth = authorize('order_hash', 'buyer_hash', { amount: 10 })
    const cap = capture(auth.hash, { adapter_ref: 'ch_456' })
    assert.equal(cap.type, 'transfer.payment')
    assert.equal(cap.state.status, 'captured')
    assert.equal(cap.refs.updates, auth.hash)
  })

  it('refunds a captured payment', () => {
    const auth = authorize('order_hash', 'buyer_hash', { amount: 10 })
    const cap = capture(auth.hash)
    const ref = refund(cap.hash, { amount: 5, reason: 'partial_refund' })
    assert.equal(ref.state.status, 'refunded')
    assert.equal(ref.state.amount, 5)
    assert.equal(ref.state.reason, 'partial_refund')
    assert.equal(ref.refs.updates, cap.hash)
  })

  it('full settlement chain: authorize → capture → refund', () => {
    const auth = authorize('ord1', 'buyer1', { adapter_ref: 'pi_abc', amount: 25 })
    const cap = capture(auth.hash, { adapter_ref: 'ch_def' })
    const ref = refund(cap.hash, { amount: 25, reason: 'customer_request' })

    assert.equal(auth.state.status, 'authorized')
    assert.equal(cap.state.status, 'captured')
    assert.equal(ref.state.status, 'refunded')
    assert.equal(cap.refs.updates, auth.hash)
    assert.equal(ref.refs.updates, cap.hash)
  })

  it('throws on missing orderHash', () => {
    assert.throws(() => authorize('', 'buyer'), /orderHash/)
  })

  it('throws on missing authHash for capture', () => {
    assert.throws(() => capture(''), /authHash/)
  })
})

describe('tab flow', () => {
  it('opens a tab', () => {
    const tab = openTab('buyer_hash', 'cafe_hash', {
      adapter: 'stripe',
      adapter_ref: 'seti_123',
      max_amount: 50
    })
    assert.equal(tab.type, 'transfer.tab')
    assert.equal(tab.state.status, 'open')
    assert.equal(tab.refs.buyer, 'buyer_hash')
    assert.equal(tab.refs.venue, 'cafe_hash')
    assert.deepEqual(tab.state.items, [])
  })

  it('adds items to a tab', () => {
    const tab = openTab('buyer', 'cafe')
    const tab2 = addToTab(tab, { name: 'Latte', price: 3.50, quantity: 1 })
    assert.equal(tab2.state.items.length, 1)
    assert.equal(tab2.state.items[0].name, 'Latte')
    assert.equal(tab2.state.running_total, 3.5)
    assert.equal(tab2.refs.updates, tab.hash)

    const tab3 = addToTab(tab2, { name: 'Croissant', price: 2.00, quantity: 2 })
    assert.equal(tab3.state.items.length, 2)
    assert.equal(tab3.state.running_total, 7.5)
  })

  it('closes a tab with tip', () => {
    const tab = openTab('buyer', 'cafe')
    const tab2 = addToTab(tab, { name: 'Coffee', price: 3.00, quantity: 1 })
    const closed = closeTab(tab2, { tip: 1.00 })
    assert.equal(closed.state.status, 'closed')
    assert.equal(closed.state.subtotal, 3)
    assert.equal(closed.state.tip, 1)
    assert.equal(closed.state.total, 4)
    assert.ok(closed.state.closed_at)
  })

  it('full tab flow: open → add → add → close', () => {
    let tab = openTab('buyer', 'cafe')
    tab = addToTab(tab, { name: 'Espresso', price: 2.50, quantity: 1 })
    tab = addToTab(tab, { name: 'Muffin', price: 3.00, quantity: 1 })
    const closed = closeTab(tab, { tip: 0.50 })

    assert.equal(closed.state.items.length, 2)
    assert.equal(closed.state.subtotal, 5.5)
    assert.equal(closed.state.tip, 0.5)
    assert.equal(closed.state.total, 6)
    assert.equal(closed.state.status, 'closed')
  })

  it('throws on missing buyerHash', () => {
    assert.throws(() => openTab('', 'venue'), /buyerHash/)
  })

  it('throws on missing tabBlock for addToTab', () => {
    assert.throws(() => addToTab(null, { name: 'x' }), /tabBlock/)
  })
})
