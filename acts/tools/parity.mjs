// parity.mjs: reads cases written by check.py (what moves.py says) and answers each with index.mjs, printing every case where
// the JavaScript reader and the Python rules disagree. Usage: node foodblock/acts/tools/parity.mjs <cases.json>
// A Node-only dev tool: it reads the files, and hands the parsed library to the pure acts/index.mjs (acts itself reads no file).
import { readFileSync } from 'node:fs';
// The JavaScript reader is FoodOS's (foodos/words/index.mjs); FoodBlock never imports FoodOS, so the library finds it only when the two repos sit side by side
// (FOODOS_WORDS names it elsewhere) and check.py skips this proof when it is not there.
const reader = process.env.FOODOS_WORDS || new URL('../../../foodx/foodos/words/index.mjs', import.meta.url).pathname;
const { library, restraintsOf } = await import(reader);

const { act, liveMoves, shortlist, nextQuestion } = library(JSON.parse(readFileSync(new URL('../compiled.json', import.meta.url), 'utf8')));
const { cases } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const off = [];
for (const c of cases) {
  let got;
  if (c.kind === 'pick') got = shortlist(c.answers).map((x) => x.id);
  else if (c.kind === 'next') got = nextQuestion(shortlist(c.answers), c.answers)?.fact ?? null;
  else {
    const a = act(c.id);
    got = !a ? 'no such act'
      : c.kind === 'restraints' ? restraintsOf(a, c.move, { deal: c.deal || null })
      : liveMoves(a, c.stage, c.pending);
  }
  if (JSON.stringify(got) !== JSON.stringify(c.want)) off.push(`${c.kind} ${c.id || ''} ${c.move || c.stage || JSON.stringify(c.answers)}: js ${JSON.stringify(got).slice(0, 200)}, python ${JSON.stringify(c.want).slice(0, 200)}`);
}
console.log(JSON.stringify(off));
