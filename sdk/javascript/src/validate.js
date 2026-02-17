/**
 * Schema validation for FoodBlocks (Section 8).
 *
 * Validates a block's state against a schema definition.
 * Validation is always optional — a block without a $schema reference is valid.
 */

// Bundled core schemas (subset — full registry is fetched from the network)
const CORE_SCHEMAS = {
  'foodblock:substance.product@1.0': {
    target_type: 'substance.product',
    version: '1.0',
    fields: {
      name: { type: 'string', required: true },
      price: { type: 'number' },
      unit: { type: 'string' },
      weight: { type: 'object' },
      allergens: { type: 'object' },
      gtin: { type: 'string' }
    },
    expected_refs: ['seller'],
    optional_refs: ['origin', 'inputs', 'certifications'],
    requires_instance_id: false
  },
  'foodblock:transfer.order@1.0': {
    target_type: 'transfer.order',
    version: '1.0',
    fields: {
      instance_id: { type: 'string', required: true },
      quantity: { type: 'number' },
      unit: { type: 'string' },
      total: { type: 'number' },
      payment_ref: { type: 'string' }
    },
    expected_refs: ['buyer', 'seller'],
    optional_refs: ['product', 'agent'],
    requires_instance_id: true
  },
  'foodblock:observe.review@1.0': {
    target_type: 'observe.review',
    version: '1.0',
    fields: {
      instance_id: { type: 'string', required: true },
      rating: { type: 'number', required: true },
      text: { type: 'string' }
    },
    expected_refs: ['subject', 'author'],
    optional_refs: [],
    requires_instance_id: true
  },
  'foodblock:actor.producer@1.0': {
    target_type: 'actor.producer',
    version: '1.0',
    fields: {
      name: { type: 'string', required: true },
      public_key_sign: { type: 'string' },
      public_key_encrypt: { type: 'string' },
      gln: { type: 'string' }
    },
    expected_refs: [],
    optional_refs: [],
    requires_instance_id: false
  },
  'foodblock:observe.certification@1.0': {
    target_type: 'observe.certification',
    version: '1.0',
    fields: {
      instance_id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      valid_until: { type: 'string' },
      standard: { type: 'string' }
    },
    expected_refs: ['subject', 'authority'],
    optional_refs: [],
    requires_instance_id: true
  }
}

/**
 * Validate a block against its declared schema or a provided schema.
 *
 * @param {object} block - The FoodBlock to validate
 * @param {object} [schema] - Optional schema object. If not provided, uses block's $schema field.
 * @param {object} [registry] - Optional custom schema registry
 * @returns {string[]} - Array of error messages (empty = valid)
 */
function validate(block, schema, registry) {
  const errors = []

  if (!block || !block.type || !block.state) {
    errors.push('Block must have type and state')
    return errors
  }

  // Resolve schema
  let schemaDef = schema
  if (!schemaDef && block.state.$schema) {
    const reg = registry || CORE_SCHEMAS
    schemaDef = reg[block.state.$schema]
    if (!schemaDef) {
      errors.push(`Unknown schema: ${block.state.$schema}`)
      return errors
    }
  }

  // No schema to validate against — block is valid
  if (!schemaDef) {
    return errors
  }

  // Check type match
  if (schemaDef.target_type && block.type !== schemaDef.target_type) {
    errors.push(`Type mismatch: block is ${block.type}, schema is for ${schemaDef.target_type}`)
  }

  // Check required fields
  if (schemaDef.fields) {
    for (const [field, def] of Object.entries(schemaDef.fields)) {
      if (def.required && block.state[field] === undefined) {
        errors.push(`Missing required field: state.${field}`)
      }
      if (block.state[field] !== undefined && def.type) {
        const actualType = typeof block.state[field]
        if (def.type === 'object' && (actualType !== 'object' || Array.isArray(block.state[field]))) {
          errors.push(`Field state.${field} should be ${def.type}, got ${actualType}`)
        } else if (def.type !== 'object' && actualType !== def.type) {
          errors.push(`Field state.${field} should be ${def.type}, got ${actualType}`)
        }
      }
    }
  }

  // Check required refs
  if (schemaDef.expected_refs) {
    for (const ref of schemaDef.expected_refs) {
      if (!block.refs || block.refs[ref] === undefined) {
        errors.push(`Missing expected ref: refs.${ref}`)
      }
    }
  }

  // Check instance_id requirement
  if (schemaDef.requires_instance_id && !block.state.instance_id) {
    errors.push('Missing required field: state.instance_id')
  }

  return errors
}

module.exports = { validate, CORE_SCHEMAS }
