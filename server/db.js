import pg from 'pg'
import { create } from '../sdk/javascript/src/index.js'
import log from './logger.js'

const logger = log.child('DB')

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/foodblock'
})

export async function insertBlock(block, authorHash = null, signature = null) {
  const existing = await pool.query('SELECT hash FROM foodblocks WHERE hash = $1', [block.hash])
  if (existing.rows.length > 0) return { exists: true, block }

  // Fork detection for unsigned blocks (NULL author_hash bypasses unique index)
  if (block.refs && block.refs.updates && !authorHash) {
    const fork = await pool.query(
      `SELECT hash FROM foodblocks WHERE refs->>'updates' = $1`,
      [block.refs.updates]
    )
    if (fork.rows.length > 0) return { conflict: true, hash: block.hash }
  }

  try {
    await pool.query(
      `INSERT INTO foodblocks (hash, type, state, refs, author_hash, signature)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [block.hash, block.type, block.state, block.refs, authorHash, signature]
    )
    return { exists: false, block }
  } catch (err) {
    if (err.code === '23505') {
      return { conflict: true, hash: block.hash }
    }
    throw err
  }
}

export async function resolveBlock(hash) {
  const { rows } = await pool.query(
    'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE hash = $1',
    [hash]
  )
  return rows[0] || null
}
