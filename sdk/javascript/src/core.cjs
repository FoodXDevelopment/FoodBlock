// The Rust core (sdk/rust) compiled to WebAssembly (core/foodblock.wasm), and the one door into it: `call(op, ...args)`
// sends the op name and its arguments as JSON and gets JSON back (src/door.rs, the same door C, Python, Go, Swift and
// Kotlin use). Every protocol rule runs in the core; the modules beside this one only name the ops and give the
// answers the shapes JavaScript callers know. The host gives the core two things it has none of: randomness and the
// clock.
//   Node: loaded synchronously when required.
//   Browser: `await core.init(source)` once (source: a URL, a fetch Response or the .wasm bytes); calls before that throw.
const isNode = typeof process !== 'undefined' && Boolean(process.versions && process.versions.node)

let instance = null, bytes = null
const memory = () => new Uint8Array(instance.exports.memory.buffer)

function randomInto(view) {
  const web = globalThis.crypto && globalThis.crypto.getRandomValues ? globalThis.crypto : require('crypto').webcrypto
  for (let at = 0; at < view.length; at += 65536) web.getRandomValues(view.subarray(at, Math.min(view.length, at + 65536)))
}
const imports = () => ({ env: {
  fb_random: (ptr, len) => randomInto(memory().subarray(ptr, ptr + len)),
  fb_now_ms: () => Date.now()
} })

function start(wasmBytes) {
  bytes = wasmBytes
  instance = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), imports())
}

/** Browser: load the core. `source` is a URL, a fetch Response (or promise of one) or the bytes. Resolves when ready. */
async function init(source) {
  if (instance) return
  const given = await source
  if (given instanceof ArrayBuffer || ArrayBuffer.isView(given)) { start(given); return }
  const response = typeof given === 'string' || given instanceof URL ? await fetch(given) : given
  const body = await response.arrayBuffer()
  if (instance) return
  bytes = body
  instance = (await WebAssembly.instantiate(body, imports())).instance
}

if (isNode) start(require('fs').readFileSync(require('path').join(__dirname, '../core/foodblock.wasm')))

// JSON turns NaN and Infinity into null without a word; the protocol refuses them (canonical.md).
function finite(key, value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('FoodBlock: Infinity and NaN are not allowed')
  return value
}

const encoder = new TextEncoder(), decoder = new TextDecoder()

/** A refusal or failure from the core. `kind`: argument, json, refused, crypto, profile or internal. */
class FoodBlockError extends Error {
  constructor(answer) {
    super(answer.message)
    this.name = 'Error'
    this.kind = answer.error
    if (answer.code) this.code = answer.code
    if (answer.refusals && answer.refusals.length) { this.refused = answer.refusals; this.wrong = answer.refusals.map((one) => one.detail) }
    else if (answer.reasons && answer.reasons.length) this.wrong = answer.reasons
  }
}

function put(text) {
  const data = encoder.encode(text), ptr = instance.exports.fb_alloc(data.length)
  memory().set(data, ptr)
  return [ptr, data.length]
}

/** Run one op of the door. Returns the answer's value; throws a FoodBlockError carrying the core's refusal. */
function call(op, ...args) {
  if (!instance) throw new Error('foodblock: the core is not loaded; in a browser call `await init(url)` first')
  let answer
  try {
    const [o, ol] = put(op), [a, al] = put(JSON.stringify(args, finite))
    const out = instance.exports.fb_call(o, ol, a, al), length = instance.exports.fb_out_len()
    answer = JSON.parse(decoder.decode(memory().slice(out, out + length)))
    instance.exports.fb_dealloc(out, length)
    instance.exports.fb_dealloc(o, ol)
    instance.exports.fb_dealloc(a, al)
  } catch (trap) {
    if (trap instanceof WebAssembly.RuntimeError) { start(bytes); throw new Error('foodblock: an internal error stopped the call') }
    throw trap
  }
  if ('error' in answer) throw new FoodBlockError(answer)
  return answer.ok
}

// ---- Shapes the callers of the SDK already use, turned into what the door takes ----
/** Blocks as a list: a list, a Map or Set of blocks, or an object of blocks by hash. */
const list = (blocks) => (Array.isArray(blocks) ? blocks : blocks instanceof Map ? [...blocks.values()] : blocks instanceof Set ? [...blocks] : blocks && typeof blocks === 'object' ? Object.values(blocks) : [])
/** `arrivedAt(hash)` (when a block arrived, an ISO time) as data: { hash: time } for the blocks given. null when the reader keeps none. */
function arrivals(arrivedAt, ...sets) {
  if (typeof arrivedAt !== 'function') return null
  const out = {}
  for (const set of sets) for (const block of list(set)) { const at = block && arrivedAt(block.hash); if (at) out[block.hash] = at }
  return out
}

module.exports = { call, init, FoodBlockError, list, arrivals }
