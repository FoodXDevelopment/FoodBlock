// Reads sdk/door.table: every operation of the Rust core's door, once. See that file for the line format.
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '../../sdk/door.table')
const ARG_TYPES = ['text', 'int', 'bool', 'block', 'object', 'blocks', 'strings', 'json', 'time', 'suite', 'arrivals']
const RESULT_TYPES = ['text', 'bool', 'int', 'block', 'blocks', 'object', 'strings', 'refusals', 'json']

function parse(text = fs.readFileSync(FILE, 'utf8')) {
  const ops = []
  let feature = 'core'
  for (const [n, line] of text.split('\n').entries()) {
    const feat = /^# Feature (\w+)/.exec(line)
    if (feat) feature = feat[1]
    if (/^# Core/.test(line)) feature = 'core'
    if (!line.trim() || line.startsWith('#')) continue
    const m = /^(\w+)\((.*)\) -> (\w+)(\?)?( !)?$/.exec(line)
    if (!m) throw new Error(`door.table line ${n + 1}: ${line}`)
    const args = m[2].trim() === '' ? [] : m[2].split(',').map((a) => {
      const g = /^\s*(\w+):(\w+)(\?)?\s*$/.exec(a)
      if (!g || !ARG_TYPES.includes(g[2])) throw new Error(`door.table line ${n + 1}: bad argument ${a}`)
      return { name: g[1], type: g[2], optional: Boolean(g[3]) }
    })
    if (!RESULT_TYPES.includes(m[3])) throw new Error(`door.table line ${n + 1}: bad result ${m[3]}`)
    ops.push({ op: m[1], args, result: m[3], nullable: Boolean(m[4]), fails: Boolean(m[5]), feature })
  }
  return ops
}

const camel = (s) => s.replace(/_(\w)/g, (_, c) => c.toUpperCase())
const pascal = (s) => camel(s).replace(/^\w/, (c) => c.toUpperCase())

module.exports = { parse, camel, pascal, FILE }
