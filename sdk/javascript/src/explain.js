/**
 * Generate a human-readable narrative from a FoodBlock graph.
 * Walks the provenance tree and renders a plain-English explanation.
 *
 * Usage:
 *   const story = await fb.explain(breadHash, resolve)
 *   // "Sourdough ($4.50) by Green Acres Bakery..."
 */

const TYPE_VERBS = {
  'transform': 'made by',
  'transfer': 'via',
  'observe': '',
}

const OBSERVE_LABELS = {
  'observe.review': 'review',
  'observe.certification': 'certified by',
  'observe.inspection': 'inspected by',
  'observe.reading': 'reading from',
  'observe.scan': 'scanned by',
}

/**
 * Generate a narrative for a block and its provenance.
 *
 * @param {string} hash - Hash of the block to explain
 * @param {function} resolve - async (hash) => block | null
 * @param {object} [opts] - { maxDepth: number (default 10) }
 * @returns {string} Human-readable narrative
 */
async function explain(hash, resolve, opts = {}) {
  const maxDepth = opts.maxDepth || 10
  const block = await resolve(hash)
  if (!block) return `Block not found: ${hash}`

  const parts = []
  const visited = new Set()

  await buildNarrative(block, resolve, parts, visited, 0, maxDepth)

  return parts.join(' ')
}

async function buildNarrative(block, resolve, parts, visited, depth, maxDepth) {
  if (!block || visited.has(block.hash) || depth > maxDepth) return
  visited.add(block.hash)

  const name = block.state.name || block.state.title || block.type
  const baseType = block.type.split('.')[0]

  // Describe the block itself
  if (depth === 0) {
    let desc = name
    if (block.state.price) desc += ` ($${block.state.price})`
    if (block.state.rating) desc += ` (${block.state.rating}/5)`
    parts.push(desc + '.')
  }

  // Follow key refs to build the story
  const refs = block.refs || {}

  // Actor refs (seller, buyer, author, operator)
  for (const role of ['seller', 'buyer', 'author', 'operator', 'producer']) {
    if (refs[role]) {
      const actor = await resolve(refs[role])
      if (actor && actor.state.name && !visited.has(actor.hash)) {
        visited.add(actor.hash)
        if (depth === 0) {
          parts.push(`By ${actor.state.name}.`)
        }
      }
    }
  }

  // Input/source refs (provenance)
  for (const role of ['inputs', 'source', 'origin', 'input']) {
    if (refs[role]) {
      const refHashes = Array.isArray(refs[role]) ? refs[role] : [refs[role]]
      const names = []
      for (const h of refHashes) {
        const dep = await resolve(h)
        if (dep && dep.state.name) {
          let depDesc = dep.state.name
          // Check for source actor
          const depSource = dep.refs && (dep.refs.seller || dep.refs.source || dep.refs.producer)
          if (depSource) {
            const sourceActor = await resolve(depSource)
            if (sourceActor && sourceActor.state.name) {
              depDesc += ` (${sourceActor.state.name})`
            }
          }
          names.push(depDesc)
        }
      }
      if (names.length > 0) {
        parts.push(`Made from ${names.join(', ')}.`)
      }
    }
  }

  // Certifications
  if (refs.certifications) {
    const certHashes = Array.isArray(refs.certifications) ? refs.certifications : [refs.certifications]
    for (const h of certHashes) {
      const cert = await resolve(h)
      if (cert && cert.state.name) {
        let certDesc = `Certified: ${cert.state.name}`
        if (cert.state.valid_until) certDesc += ` (expires ${cert.state.valid_until})`
        parts.push(certDesc + '.')
      }
    }
  }

  // Update chain
  if (refs.updates && !visited.has(refs.updates)) {
    const prev = await resolve(refs.updates)
    if (prev) {
      const prevName = prev.state.name || prev.type
      if (prev.state.price && block.state.price && prev.state.price !== block.state.price) {
        parts.push(`Updated from $${prev.state.price}.`)
      }
    }
  }

  // Tombstone
  if (block.state.tombstoned) {
    parts.push('This block has been erased.')
  }
}

module.exports = { explain }
