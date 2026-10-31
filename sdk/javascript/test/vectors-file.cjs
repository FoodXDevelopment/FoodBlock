// The one place the vector makers find and save spec/vectors.json (`VECTORS_FILE=path` points a maker at a copy).
// A case states the invariants it carries itself, `invariants: [n]` (test/necessity.cjs reads them). A maker writes the case
// afresh, so `save` hands the tags of the file it read to the cases it wrote under the same name; a case that is new says its own.
const fs = require('fs')
const path = require('path')
const FILE = process.env.VECTORS_FILE || path.join(__dirname, '../../../spec/vectors.json')
const tagged = (root) => {
  const found = new Map()
  const walk = (x, where) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, where))
    if (!x || typeof x !== 'object') return
    if (typeof x.name === 'string' && Array.isArray(x.invariants)) found.set(`${where}\0${x.name}`, x.invariants)
    for (const [k, y] of Object.entries(x)) walk(y, where + '/' + k)
  }
  walk(root, '')
  return found
}
function load() {
  const text = fs.readFileSync(FILE, 'utf8')
  return { V: JSON.parse(text), tags: tagged(JSON.parse(text)) }
}
function save(V, tags) {
  const walk = (x, where) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, where))
    if (!x || typeof x !== 'object') return
    if (typeof x.name === 'string' && !x.invariants && tags.has(`${where}\0${x.name}`)) x.invariants = tags.get(`${where}\0${x.name}`)
    for (const [k, y] of Object.entries(x)) walk(y, where + '/' + k)
  }
  walk(V, '')
  fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
}
module.exports = { FILE, load, save }
