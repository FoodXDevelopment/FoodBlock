// The store: the oracle builder's fourteen hand-signed stories (store-stories/stories.cjs; their questions are printed by `node store-stories/stories.cjs`).
// Every door call a story makes is recorded with its arguments and
// asked of both engines, so `run.cjs` can compare the oracle and the core question by question. `require` it for `{ worlds, questions }`.
const oracle = require('../../spec/oracle/fb.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')

const questions = []
const door = oracle.door
let story = ''
oracle.door = (op, ...args) => {
  const copy = JSON.parse(JSON.stringify(args))
  let answer
  try { answer = door(op, ...args) } catch (e) { questions.push({ world: 'k2 story ' + story, case: story, question: op, op, args: copy, oracleAnswer: { error: e.message } }); throw e }
  questions.push({ world: 'k2 story ' + story, case: story, question: op, op, args: copy, oracleAnswer: answer })
  return answer
}
const log = console.log
console.log = (line) => { const m = /^([^|]+?) \| (.*?) => /.exec(String(line)); if (m) { story = m[1]; const q = questions.filter((x) => x.case === '' || x.pending); for (const x of q) { x.case = m[1]; x.world = 'k2 story ' + m[1]; x.question = m[2]; delete x.pending } } }
// a question is named by the story line printed after it
const push = questions.push.bind(questions)
questions.push = (q) => push({ ...q, case: '', pending: true })
try { require('./store-stories/stories.cjs') } finally { oracle.door = door; console.log = log }
for (const q of questions) {
  try { q.core = call(q.op, ...JSON.parse(JSON.stringify(q.args))) } catch (e) { q.core = { error: e.message } }
}
module.exports = { questions, worlds: require('./store-stories/lib.cjs').ALL }
if (require.main === module) {
  const { same, J } = require('./same.cjs')
  let d = 0
  for (const q of questions) {
    const a = J(q.core), b = J(q.oracleAnswer)
    if (same(q.core, q.oracleAnswer)) continue
    if (a !== b) { d++; console.log(`DIFF ${q.case} | ${q.question} | ${q.op}\n  core   ${a.slice(0, 300)}\n  oracle ${b.slice(0, 300)}`) }
  }
  console.log(questions.length, 'calls,', d, 'differ')
}
