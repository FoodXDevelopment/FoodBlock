'use strict';
// Stories of the read-back. Same helpers as the other stories: each question prints the oracle's answer and the answer the text gives, and OK or DIFF.
// Signed with Node's own crypto (the circles helpers), never the oracle's signer. People sign their own name in their genesis (`state.name`), as R2 reads it.
const L = require('../circles/lib.cjs');
const { fb, person, NAME, A } = L;
const R = require('../../readback/reading.cjs');
const { en } = require('../../readback/en.cjs');
const { enSms } = require('../../readback/en-sms.cjs');
const RD = require('../../readback/redo.cjs');
// a person who signs her own name: a genesis carries no name (bad_genesis), so she signs it in her own actor block that `updates` her genesis (the text does not say; read so)
const Pn = (w, n, name) => { const p = person(w, n); NAME.set(p.id, n); if (name !== null) p.write('actor', { kind: 'person', name: name || n.charAt(0).toUpperCase() + n.slice(1) }, { updates: p.id }); return p; };
const code = id => fb.door('short_code', id);
const GBP = v => A(String(v), 'GBP');
// the read-back of a block, to a viewer, in both renderers
const rb = (b, held, viewer) => { const a = R.readback(b, held, viewer.id || viewer); return { a, en: en(a), sms: enSms(a) }; };
// GSM-7 length: the basic set counts 1, the extension table 2; any other character is not GSM-7 (Infinity)
const BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const EXT = '^{}\\[~]|€\f';
const gsm7 = s => [...s].reduce((n, c) => n + (BASIC.includes(c) ? 1 : EXT.includes(c) ? 2 : Infinity), 0);
module.exports = { ...L, R, en, enSms, RD, Pn, code, GBP, rb, gsm7 };
