'use strict';
// Maria's world (01-keys.md section 5): card in a drawer (by hash, first); mum and brother (both, wait P7D); her phone (wait P30D, reach P1D, her genesis key);
// clocks: the shop, her host, her aunt (any two). A lost phone, a stolen phone, a thief with ten minutes, a malicious host, a key under a voice.
const { fb, World, mkKey, person, Signer, receipt, cutoff, day } = require('./lib.cjs');
const sub = (s) => ({ subject: s.id });
const confirm = (who, word, after = [], at) => who.write('observe', { kind: 'confirm' }, { confirms: word.hash, ...(after.length ? { after: after.map(b => b.hash).sort() } : {}) }, at ? { at } : {});

function setup() {
  const w = new World();
  const maria = person(w, 'maria-phone');                 // her first key: the phone's, her genesis key
  const shop = person(w, 'shop'), host = person(w, 'host'), aunt = person(w, 'aunt'), mum = person(w, 'mum'), brother = person(w, 'brother'), thief = person(w, 'thief');
  const card = mkKey('maria-card');
  const keepers = { names: [shop.id, host.id, aunt.id].sort(), needed: 2 };
  const voices = [
    { key_hash: fb.keyHash(card.pub) },
    { names: [mum.id, brother.id].sort(), needed: 2, wait: 'P7D' },
    { key: maria.key.pub, wait: 'P30D', reach: 'P1D' },
  ];
  const K1 = maria.write('grant', { kind: 'key', voices, clocks: keepers }, { subject: maria.id, updates: maria.id }, { at: day(0) });
  const C1 = confirm(maria, K1, [], day(0, 0, 1));          // the phone signs it again: the first voice's wait is zero
  return { w, maria, shop, host, aunt, mum, brother, thief, card, keepers, voices, K1, C1 };
}
// the new list with the phone's place given to a new key; `extra` more voices below
const withPhone = (s, key, below = []) => [s.voices[0], s.voices[1], { key: key.pub, wait: 'P30D', reach: 'P1D' }, ...below];
// a wait run on two keepers' lines: both receipt the word, then each signs a cutoff through receipt + the wait; returns the two cutoffs
function closeWait(s, word, wait, days, receiptsAt = day(10, 1), named = []) {
  const r1 = receipt(s.shop, word, receiptsAt), r2 = receipt(s.host, word, new Date(Date.parse(receiptsAt) + 60000).toISOString());
  const t = d => new Date(Date.parse(receiptsAt) + d * 86400000 + 3600000).toISOString();
  // Each cutoff states the span itself (`wait`) and runs from that clock's own receipt
  return { r1, r2, c1: cutoff(s.shop, word, wait, t(days), [r1, ...named]), c2: cutoff(s.host, word, wait, new Date(Date.parse(t(days)) + 60000).toISOString(), [r2, ...named]) };
}
module.exports = { setup, withPhone, closeWait, confirm, sub };
