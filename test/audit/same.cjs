// One way to compare two engines' answers to a door call: keys sorted; a refusal's `detail` is free text no node reads, so it is left out;
// an argument error is an error, whatever its words.
const J = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().filter((key) => !(key === 'detail' && 'code' in v)).map((key) => [key, v[key]])) : v))
const norm = (x) => (x && typeof x === 'object' && !Array.isArray(x) && 'error' in x && Object.keys(x).every((k) => k === 'error' || k === 'message' || k === 'code') ? { error: true } : x)
const same = (a, b) => J(norm(a)) === J(norm(b))
module.exports = { J, same, norm }
