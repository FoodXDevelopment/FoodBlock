'use strict';
// The read-back that can be redone (changes-1.9/07-last.md, C3; profiles/short-form.md). Three door ops of class `reading` (protocol.json door.classes.reading); no protocol op.
// A `readback` is an `observe` of kind `readback`, `refs.for` the block, `refs.to` the person it is read back to, and in `state`: `readback` the digest of its text;
// `reading` and `renderer`, each named as a rule set is: the SHA-256 hex of the canonical manifest { files: { path under spec/: SHA-256 hex of the file's bytes } } over the
// published text and its cases (spec/readings/, spec/renderers/); `read` the sorted ids the reading read (the answer's `read`); `digits` the digits its text ends in.
// The text is the renderer's output, one space, the digits; its digest is the SHA-256 hex of that text's UTF-8 bytes. Words after the digits are the host's own.
// This file and reading.cjs, en.cjs, en-sms.cjs are the oracle's implementation of those published files: it runs a file when it passes the file's cases.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fb = require('../fb.cjs');
const { readback: reading } = require('./reading.cjs');
const { en } = require('./en.cjs');
const { enSms } = require('./en-sms.cjs');
const SPEC = path.join(__dirname, '..', '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
// the published files, by path under spec/: each reading and renderer is its text and its cases
const FILES = {
  reading: ['readings/readback.md', 'readings/readback.cases.json'],
  en: ['renderers/en.md', 'renderers/en.cases.json'],
  'en-sms': ['renderers/en-sms.md', 'renderers/en-sms.cases.json'],
};
const RENDER = { en, 'en-sms': enSms };
// a name, as a rule set's (rule_set): computed from the files' bytes each time, never written down; null where a file is not there
const nameOf = files => {
  const m = {};
  for (const f of files) { const p = path.join(SPEC, f); if (!fs.existsSync(p)) return null; m[f] = fs.readFileSync(p, 'utf8'); }
  return fb.door('rule_set', m).id;
};
const names = () => ({ reading: nameOf(FILES.reading), en: nameOf(FILES.en), 'en-sms': nameOf(FILES['en-sms']) });
const textOf = (rendered, digits) => (digits === undefined || digits === null ? rendered : rendered + ' ' + digits);
const digestOf = text => sha(Buffer.from(text, 'utf8'));
// en-sms (renderers/en-sms.md, Texts): a text longer than 160 characters runs whole over several texts, in order, never cut short.
// Each takes the most whole words that fit 160 characters (code points), split at a space that is dropped; a longer word is cut every 160.
const SMS = 160;
const smsTexts = text => {
  if ([...text].length <= SMS) return [text];
  const out = []; let cur = null;
  for (const word of text.split(' ')) {
    let w = [...word];
    if (cur !== null && cur.length + 1 + w.length <= SMS) { cur.push(' ', ...w); continue; }
    if (cur !== null) out.push(cur.join(''));
    while (w.length > SMS) { out.push(w.slice(0, SMS).join('')); w = w.slice(SMS); }
    cur = w;
  }
  out.push(cur.join(''));
  return out;
};
const argError = m => { const e = new Error(m); e.kind = 'argument'; return e; };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const digitsArg = d => {
  if (d === undefined || d === null) return null;
  if (typeof d === 'string' && /^[0-9]+$/.test(d)) return d;
  if (Number.isInteger(d) && d >= 0) return String(d);
  throw argError('digits is text of digits, or a whole number');
};
// render(answer, renderer) -> the text: the renderer reads the answer only
function render(answer, renderer) {
  const r = RENDER[renderer];
  if (!r) throw argError('renderer is en or en-sms');
  if (!isObj(answer)) throw argError('answer is a readback reading\'s answer');
  return r(answer);
}
// readback(block, held, to?, renderer?, digits?) -> { answer, text, state }: what an honest host sends (text) and signs (state, its observe's);
// for en-sms also `texts`: the text, whole, over texts of at most 160 characters, in order (the digest is still of the one text)
function make(block, held, to, renderer, digits) {
  const list = Array.isArray(held) ? held : [];
  const b = typeof block === 'string' ? list.find(x => isObj(x) && x.hash === block) : block;
  if (!isObj(b) || typeof b.hash !== 'string') throw argError('argument 0 is the block a read-back is for (a block, or its id among held)');
  const rname = renderer === undefined || renderer === null ? 'en' : renderer;
  if (!RENDER[rname]) throw argError('renderer is en or en-sms');
  if (to !== undefined && to !== null && typeof to !== 'string') throw argError('to is an id');
  const d = digitsArg(digits);
  const answer = reading(b, list, to === undefined ? null : to);
  const text = textOf(render(answer, rname), d);
  const n = names();
  const state = { kind: 'readback', readback: digestOf(text), reading: n.reading, renderer: n[rname], read: answer.read };
  if (d !== null) state.digits = d;
  return rname === 'en-sms' ? { answer, text, texts: smsTexts(text), state } : { answer, text, state };
}
// readback_redo(rb, held) -> { same, readback, lacks, not_run }: a second reader runs the reading and the renderer on the ids in rb.state.read (and refs.for) alone.
// An input not held: same and readback null, lacks the ids. A reading or renderer this build does not run: same and readback null, not_run those names.
function redo(rb, held) {
  if (!isObj(rb) || !isObj(rb.state) || !isObj(rb.refs)) throw argError('rb is an observe of kind readback');
  const st = rb.state, n = names();
  const byId = new Map((Array.isArray(held) ? held : []).filter(b => isObj(b) && typeof b.hash === 'string' && typeof b.type === 'string').map(b => [b.hash, b]));
  const rname = Object.keys(RENDER).find(k => n[k] !== null && n[k] === st.renderer);
  const not_run = [];
  if (n.reading === null || st.reading !== n.reading) not_run.push(st.reading === undefined ? null : st.reading);
  if (!rname) not_run.push(st.renderer === undefined ? null : st.renderer);
  const inputs = Array.isArray(st.read) ? st.read.filter(x => typeof x === 'string') : [];
  const forId = rb.refs.for;
  const lacks = [...new Set([forId, ...inputs])].filter(id => typeof id === 'string' && !byId.has(id)).sort();
  if (typeof forId !== 'string' && !lacks.length) lacks.push(null);
  if (not_run.length || lacks.length) return { same: null, readback: null, lacks, not_run };
  const answer = reading(byId.get(forId), inputs.map(id => byId.get(id)), typeof rb.refs.to === 'string' ? rb.refs.to : null);
  const digest = digestOf(textOf(RENDER[rname](answer), st.digits === undefined ? null : st.digits));
  return { same: digest === st.readback, readback: digest, lacks: [], not_run: [] };
}
module.exports = { make, redo, render, names, digestOf, textOf, smsTexts, FILES };
