'use strict';
// What every part of the oracle reads: protocol.json and conventions.json, and the small helpers of values, times and lines.
const crypto = require('crypto');
const SUITES = ['std', 'p256', 'sm'];
const SPEC = require('path').join(__dirname, '..') + '/';
// how deep a reader reads what carries a block and the chain of places a thing is in (protocol.json limits.read_depth; encoding.md, Limits)
const READ_DEPTH = require(require('path').join(__dirname, '..') + '/protocol.json').limits.read_depth;
// protocol.json, read as it is (the oracle patches nothing at load)
const P = JSON.parse(require('fs').readFileSync(SPEC + 'protocol.json', 'utf8'));
// conventions.json: a node's conventions and the lists of readings and tools (envelope, messages, cbor, profiles, the other ops' door entries); no word reads it
const C = JSON.parse(require('fs').readFileSync(SPEC + 'conventions.json', 'utf8'));
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = x => typeof x === 'string';
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const byHash = (a, b) => cmp(a.hash, b.hash);
// strings compared by the bytes of their UTF-8 (a shorter before a longer it begins)
const byBytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
// a time as milliseconds, or null when it is no time; a block's own date; a grant's scope.expires
const timeMs = s => (isStr(s) && !isNaN(Date.parse(s)) ? Date.parse(s) : null);
const termsOf = b => (isObj(b.state.terms) ? b.state.terms : {}); // a promise's terms, read as an object
const atMs = b => timeMs(b.state && b.state.at);
const expiresMs = g => (isObj(g.state.scope) ? timeMs(g.state.scope.expires) : null);
// ranOut(grant, block): the grant's scope.expires has come by the block's own date, a cut there. Silence may only narrow, never widen: a
// block with no date is cut too. (A block under a grant is the other reading: grantLive keeps a dateless block.)
const ranOut = (grant, block) => { const u = expiresMs(grant); return u !== null && (atMs(block) === null || u <= atMs(block)); };
// the fields that hold each shape (protocol.json field_shape): time, date, duration, or exactly one keyed shape
const fieldsOf = shape => Object.keys(P.field_shape).filter(k => P.field_shape[k] === shape);
const TIME_FIELDS = fieldsOf('time'), DATE_FIELDS = fieldsOf('date'), DURATION_FIELDS = fieldsOf('duration'), BARE_FIELDS = fieldsOf('shape').filter(f => !['voices', 'clocks'].includes(f)); // voices and clocks are read by voicesFindings and clocksOf
Object.assign(module.exports, { crypto, SUITES, SPEC, READ_DEPTH, P, C, isObj, isStr, cmp, byHash, byBytes, timeMs, termsOf, atMs, ranOut, TIME_FIELDS, DATE_FIELDS, DURATION_FIELDS, BARE_FIELDS });
