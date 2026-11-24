// The store: two append-only files. blocks.jsonl: lines { n, hash, message, at }, one per block, numbered in arrival order and never
// reused. A public block is kept whole; a sealed one is kept as its public header and signature only. copies.jsonl: lines
// { hash, recipient, message }, the sealed copies (envelope included) kept for the people they are sealed to. The host never opens
// an envelope: it has no key that could. Nothing is updated, removed or rewritten; a block or copy already held is left as it is.
import fs from 'node:fs'
import path from 'node:path'
import fb from './sdk.cjs'

export const isSealed = (message) => Boolean(message?.header)
/** A sealed block as the host knows it: its public header, in the shape of a block, so chains and filters still work. */
export const headerBlock = ({ header, header_signature }) => ({ hash: header.hash, state: { seq: header.seq, audience: ['sealed'], ...(header.skip ? { skip: true } : {}) }, refs: { author: header.author, prev: header.prev }, header_signature })
/**
 * The lines of a store file. A crash mid-append leaves half a last line (no newline after it): that fragment was never a kept record, so it is set
 * aside in `<file>.torn` (not lost), cut from the file so the next append starts on a clean line, and reported in `torn`. A damaged line anywhere
 * else is not a crash and stops the open.
 */
function lines(file, torn) {
  if (!fs.existsSync(file)) return []
  let text = fs.readFileSync(file, 'utf8')
  const cut = text.lastIndexOf('\n') + 1
  if (cut < text.length) {
    const fragment = text.slice(cut)
    try { JSON.parse(fragment) } catch {
      fs.appendFileSync(file + '.torn', fragment + '\n'); fs.truncateSync(file, Buffer.byteLength(text.slice(0, cut)))
      torn.push({ file: path.basename(file), bytes: Buffer.byteLength(fragment) }); text = text.slice(0, cut)
    }
  }
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

export function openStore(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'blocks.jsonl'), copiesFile = path.join(dir, 'copies.jsonl')
  const torn = []   // the half lines a crash left, found on open: { file, bytes }
  const entries = [], byHash = new Map(), copies = new Map()   // copies: `${hash}:${recipient}` -> { hash, recipient, message }
  for (const { n, hash, message, at } of lines(file, torn)) {
    const block = isSealed(message) ? headerBlock(message) : { ...fb.unwrap(message), hash }
    entries.push({ n, hash, message, block, sealed: isSealed(message), at }); byHash.set(hash, entries.at(-1))
  }
  for (const copy of lines(copiesFile, torn)) copies.set(`${copy.hash}:${copy.recipient}`, copy)
  // the files are the owner's alone: a file made earlier with wider rights is narrowed on open
  for (const f of [file, copiesFile]) try { fs.chmodSync(f, 0o600) } catch {}
  // the places of a chain (one key's one prev, or one seq): a pair's proof rides with any answer that includes one of its blocks, so a pull reads these, not the whole store
  const places = new Map()
  const placeKeys = (block) => (block.refs?.author && block.refs?.prev ? [`p:${block.refs.author}:${block.refs.prev}`, ...(Number.isInteger(block.state?.seq) ? [`s:${block.refs.author}:${block.state.seq}`] : [])] : [])
  const place = (entry) => { for (const key of placeKeys(entry.block)) { if (!places.has(key)) places.set(key, []); places.get(key).push(entry) } }
  entries.forEach(place)
  // arrival time is the host's own log (when it took a block), the count the admission rule reads
  const plain = ({ hash, recipient, message }) => ({ hash, recipient, message })   // a copy as it travels: the arrival time and author are this host's own bookkeeping
  const recentCopies = (since) => { const out = []; for (const copy of copies.values()) if (copy.at >= since.toISOString()) out.push(copy); return out }
  const recent = (since) => { const out = []; for (let i = entries.length - 1; i >= 0 && entries[i].at >= since.toISOString(); i--) out.push(entries[i]); return out }
  return {
    file, torn,
    // a sealed copy is an arrival too: it costs the host disk, so it counts against the author who sent it
    arrivedSince: (author, since) => recent(since).filter((entry) => (entry.block.refs?.author || entry.block.hash) === author).length + recentCopies(since).filter((copy) => copy.author === author).length,
    strangersSince: (exempt, since) => recent(since).filter((entry) => !exempt.includes(entry.block.refs?.author || entry.block.hash)).length + recentCopies(since).filter((copy) => !exempt.includes(copy.author)).length,
    /** The entries after an arrival number, `most` of them, with the other blocks of any pair (one key, one prev or one seq) that one of them belongs to. */
    window(since, most) {
      const from = Math.max(0, since)   // arrival numbers count from 1 with no gap: the entry numbered n is entries[n - 1]
      if (from >= entries.length) return { rows: [], through: since }
      const rows = entries.slice(from, from + most), extra = new Map()
      for (const entry of rows) for (const key of placeKeys(entry.block)) for (const other of places.get(key) || []) if (other.n !== entry.n && !rows.includes(other)) extra.set(other.n, other)
      return { rows: [...rows, ...extra.values()].sort((a, b) => a.n - b.n), through: rows.at(-1).n, rivals: extra.size > 0 }
    },
    has: (hash) => byHash.has(hash),
    get: (hash) => byHash.get(hash)?.block ?? null,
    count: () => entries.length,
    entries: () => entries.slice(),
    blocks: () => entries.map((entry) => entry.block),
    /** What the SDK's checks are given as `blocks`: a public block whole, a sealed one as its header message. */
    given: () => entries.map((entry) => (entry.sealed ? entry.message : entry.block)),
    /** Appends a block the caller has already checked (a sealed one as a header message). A hash already held is left as it is (returns null). */
    append(block) {
      const sealed = isSealed(block), hash = sealed ? block.header.hash : block.hash
      if (byHash.has(hash)) return null
      const message = sealed ? { header: block.header, header_signature: block.header_signature } : fb.wrap(block)
      const entry = { n: entries.length + 1, hash, message, block: sealed ? headerBlock(message) : block, sealed, at: new Date().toISOString() }
      fs.appendFileSync(file, JSON.stringify({ n: entry.n, hash, message, at: entry.at }) + '\n', { flag: 'a', mode: 0o600 })
      entries.push(entry); byHash.set(hash, entry); place(entry)
      return entry
    },
    /** Keeps a sealed copy for one recipient, once. Only for a sealed block already held, and only a copy that describes that header exactly. */
    addCopy(hash, recipient, message) {
      const held = byHash.get(hash)
      const same = (a, b) => ['author', 'seq', 'prev', 'hash'].every((k) => a[k] === b[k]) && Boolean(a.skip) === Boolean(b.skip)
      if (!held?.sealed || !message?.envelope || !same(held.message.header, message.header) || message.header_signature !== held.message.header_signature) return false
      const key = `${hash}:${recipient}`
      if (copies.has(key)) return false
      const copy = { hash, recipient, message, author: held.message.header.author, at: new Date().toISOString() }
      fs.appendFileSync(copiesFile, JSON.stringify(copy) + '\n', { flag: 'a', mode: 0o600 })
      copies.set(key, copy)
      return true
    },
    hasCopy: (hash, recipient) => copies.has(`${hash}:${recipient}`),
    copiesFor: (recipient, hashes) => [...copies.values()].filter((c) => c.recipient === recipient && (!hashes || hashes.includes(c.hash))).map(plain),
    allCopies: () => [...copies.values()].map(plain)
  }
}
