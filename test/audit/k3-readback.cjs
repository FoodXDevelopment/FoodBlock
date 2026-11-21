// node test/audit/k3-readback.cjs : the read-back, the core (sdk/javascript/src/core.cjs `call`, the WebAssembly) beside the oracle (spec/oracle, `fb.door`)
// (changes-1.9/07-last.md, section 7: readings/readback, renderers/en and en-sms are run by both engines and must give the same answer and digest on every case).
// Asked: every case of spec/readings/readback.cases.json, and every read-back the oracle's stage 7 stories ask (7-readback, 7-readback-lines and the random worlds
// of 7-readback-random), each as `readback(block, held, to, renderer, '47')` for `en` and `en-sms`: the answer, the text and the state (its digest) must be identical.
// Where they differ, it says whether the two engines' `ownership` of a thing the block names differ too (a fold split, not the read-back's).
// Exits 1 on any difference.
const path = require('path')
const ROOT = path.join(__dirname, '../..')
const fb = require(path.join(ROOT, 'spec/oracle/fb.cjs'))
const { call } = require(path.join(ROOT, 'sdk/javascript/src/core.cjs'))
const R = require(path.join(ROOT, 'spec/oracle/readback/reading.cjs'))

const jcs = fb.jcs
const copy = (x) => JSON.parse(JSON.stringify(x))
let asked = 0
const differ = []
const { gsm7 } = require(path.join(ROOT, 'spec/oracle/stage7/7-readback-lib.cjs'))
const long = [], longElsewhere = []
const seen = new Set()
const run = (engine, args) => { try { return engine('readback', ...copy(args)) } catch (e) { return { error: String(e.message).split('\n')[0] } } }
function compare (where, block, held, to) {
  const key = jcs([block, held.map((b) => b.hash || jcs(b)), to])
  if (seen.has(key)) return
  seen.add(key)
  for (const renderer of ['en', 'en-sms']) {
    const args = [block, held, to === undefined ? null : to, renderer, '47']
    const c = run(call, args), o = run(fb.door, args)
    asked++
    // 07 section 4: every en-sms decision text (the words, a space, the digits) is at most 160 GSM-7 characters, in each engine, across the random worlds
    if (renderer === 'en-sms') for (const [engine, r] of [['core', c], ['oracle', o]]) if (r && typeof r.text === 'string' && gsm7(r.text) > 160) (where === '7-readback-random.cjs' ? long : longElsewhere).push({ where, engine, n: gsm7(r.text), text: r.text })
    if (jcs(c) === jcs(o)) continue
    const parts = ['answer', 'text', 'state'].filter((k) => jcs(c[k]) !== jcs(o[k]))
    const things = [...new Set([].concat(block.refs.what || []))].filter((w) => typeof w === 'string')
    const fold = things.some((w) => { const t = held.find((b) => b.hash === w); if (!t) return false; try { return jcs(call('ownership', copy(t), copy(held))) !== jcs(fb.door('ownership', t, held)) } catch (e) { return true } })
    differ.push({ where, renderer, parts, fold, core: c.text, oracle: o.text })
  }
}

// 1. the published cases
const cases = require(path.join(ROOT, 'spec/readings/readback.cases.json'))
for (const [i, k] of cases.cases.entries()) compare('readback.cases.json #' + i, cases.blocks[k.block], k.held.map((j) => cases.blocks[j]), k.to)

// 2. every read-back the stories ask, the random worlds' included
const reading = R.readback
let story = ''
R.readback = (b, held, to) => { compare(story, b, (held || []).filter((x) => x && typeof x === 'object'), to); return reading(b, held, to) }
const quiet = console.log
console.log = () => {}
for (const f of ['7-readback.cjs', '7-readback-lines.cjs', '7-readback-random.cjs']) { story = f; require(path.join(ROOT, 'spec/oracle/stage7', f)) }
console.log = quiet
process.exitCode = 0

const fold = differ.filter((d) => d.fold)
console.log(`k3-readback: ${asked} read-backs asked of both engines (${seen.size} distinct, en and en-sms each), ${differ.length} differ` + (differ.length ? ` (${fold.length} where the engines' ownership fold differs on a thing the block names)` : ''))
for (const d of differ.slice(0, 12)) console.log(`  ${d.where} ${d.renderer}: ${d.parts.join(', ')}${d.fold ? ' [ownership fold split]' : ''}\n    core:   ${JSON.stringify(d.core)}\n    oracle: ${JSON.stringify(d.oracle)}`)
console.log(`k3-readback: en-sms decision texts over 160 GSM-7 characters in the random worlds: ${long.length}` + (longElsewhere.length ? ` (in the stories and cases, not counted: ${new Set(longElsewhere.map(x => x.text)).size} distinct texts)` : ''))
for (const d of long.slice(0, 6)) console.log(`  ${d.engine} ${d.n}: ${JSON.stringify(d.text)}`)
process.exitCode = differ.length || long.length ? 1 : 0
