'use strict';
// spec/renderers/en (renderers/en.md): one reading's answer (readings/readback) into English. Not normative; named by the SHA-256 of this file's bytes.
// It reads that answer only, never a block, reads no free text and classifies nothing: names and units are copied as signed, never translated (no "£" for "GBP").
// Each line copies one answer field (the number in the comment is its line in renderers/en.md). A line is said only where it changes what she would do.
// It names no rule set, prints no fraction, never prints `needed` or `names`, and never tells her that her own word keeps nothing aside.
function en(a) {
  const me = a.viewer ? a.viewer.id : null;
  const seen = new Set();
  // a person: "you", or the name she signed with her short code at first mention; one who signed no name is "an id you have no name for (CODE)" (17)
  const who = p => {
    if (!p) return 'an id not named here';
    if (p.id === me) return 'you';
    if (p.name === null) { if (seen.has(p.id)) return 'that id'; seen.add(p.id); return 'an id you have no name for (' + p.code + ')'; }
    if (seen.has(p.id)) return p.name;
    seen.add(p.id); return p.name + ' (' + p.code + ')';
  };
  const whose = p => (p && p.id === me ? 'your' : who(p) + "'s");
  const says = p => (p && p.id === me ? 'you say' : who(p) + ' says');
  const thing = t => { if (t.name === null) return t.code; if (seen.has(t.id)) return t.name; seen.add(t.id); return t.name + ' (' + t.code + ')'; };
  const amt = x => x.value + ' ' + x.unit;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const and = l => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]);
  const out = [];
  const signer = a.for.signer;
  if (signer && signer.id !== me) out.push('From ' + who(signer) + '.'); // 17
  else if (a.other) out.push('To ' + who(a.other) + '.');
  if (a.not_valid) { out.push('No key signed this as it stands.'); return out.join('\n'); }
  if (a.not_shown) { out.push("Can't tell yet: " + n(a.lacks.length) + ' of ' + whose(signer) + ' blocks ' + (a.lacks.length === 1 ? 'is' : 'are') + ' missing.'); return out.join('\n'); }
  if (a.not_read) { // 19
    out.push(a.not_read.rule_set && !a.not_read.fields
      ? 'Your reader does not read the rules this names, so it cannot say what this binds you to. Nothing was guessed.'
      : 'Your reader does not read ' + (a.not_read.fields <= 1 ? 'one field' : a.not_read.fields + ' fields') + ' here, so it cannot say what this binds you to. Nothing was guessed.');
    return out.join('\n');
  }
  if (a.first_deal && signer && signer.id !== me) out.push('First deal with this ' + (a.other_side === 'to' ? 'buyer' : 'seller') + '.'); // 17
  if (a.audience !== 'public' && signer && signer.id !== me) out.push(a.audience.readers + ' readers; you can see only yourself.'); // 18
  if (a.what) out.push('In ' + whose(a.what.by) + ' words: "' + a.what.text + '".'); // the deal's own words, quoted word for word, never read
  for (const l of a.things) {
    const T = () => thing(l.what), to = l.to, mine = to && to.id === me;
    if (l.what.pack && mine && l.draw && l.draw.state === 'held') out.push(T() + ': ' + amt(l.what.pack) + ', on ' + whose(l.what.stated_by) + ' word.'); // 9
    const d = l.draw;
    if (l.pair && !(d && d.why === 'pair')) out.push(T() + ': ' + who(l.by) + ' signed it twice.'); // 7, where the fold reads one draw of the pair alone
    if (d === 'not_drawn') continue;
    if (d === null) { if (l.amount && mine && l.by && l.by.id !== me && signer && l.by.id === signer.id) out.push(T() + ', ' + amt(l.amount) + ': ' + whose(l.by) + ' word; nothing set aside.'); continue; } // 4
    if (d.not_shown) { out.push(T() + ": can't tell yet: " + n(d.lacks.length) + ' of ' + whose(l.by) + ' blocks ' + (d.lacks.length === 1 ? 'is' : 'are') + ' missing.'); continue; } // 5
    if (d.state === 'landed') { out.push(T() + ': ' + (mine ? 'yours' : whose(to)) + '.'); continue; } // 1
    if (d.state === 'held' && l.holder) { out.push(T() + ': held for ' + who(to) + ' by ' + who(l.holder) + ', until ' + says(l.freer) + ' no.'); continue; } // 3
    if (d.state === 'held') { out.push(T() + ': kept for ' + who(to) + ', in ' + whose(l.by) + ' hands' + (mine ? ', on ' + whose(l.by) + ' record as you hold it' : '') + ', until ' + says(l.freer) + ' no.'); continue; } // 2
    if (d.state === 'freed') { out.push(T() + ': freed: ' + who(l.by) + ' may sell it again.'); continue; } // 8
    if (d.why === 'past' || d.why === 'not_owner') { out.push(T() + ': not ' + whose(l.by) + " to give: already another's."); continue; } // 6
    if (d.why === 'pair') { out.push(T() + ': ' + who(l.by) + ' signed it twice.' + (l.pair && l.pair.some(p => p.to && p.to.id === me) ? ' Neither is shown as yours.' : '')); continue; } // 7
    if (d.why) { out.push(T() + ': ' + whose(l.by) + ' word here takes none of it.'); continue; }
    out.push(T() + ": can't tell yet.");
  }
  for (const m of a.money) if (m.to && m.to.id === me && m.by && m.by.id !== me && signer && m.by.id === signer.id) out.push(amt(m.amount) + ' to you: ' + whose(m.by) + ' word; nothing set aside.'); // 4
  const mineAmts = a.amounts.find(s => s.side && s.side.id === me);
  const moneyKinds = new Set(a.money.map(m => m.amount.unit + '|' + (m.amount.of || '')));
  if (mineAmts) { // 10
    for (const x of mineAmts.out) if (moneyKinds.has(x.unit + '|' + (x.of || ''))) out.push('You pay at most ' + amt(x) + ' in all.');
    for (const x of mineAmts.in) if (moneyKinds.has(x.unit + '|' + (x.of || ''))) out.push('You may be paid as little as ' + amt(x) + '.');
  }
  if (a.terms && a.terms.waits_on === 'price') { const payee = a.money[0] ? a.money[0].to : null; out.push(cap('done when ' + says(payee) + ' so.')); } // 16
  if (a.terms && a.terms.waits_on === 'goods') { const r = a.money[0] ? a.money[0].by : null; out.push(cap('paid when ' + says(r) + ' it came.')); } // 16
  const g = a.grant;
  if (g && g.not_shown) out.push("The most you can be made to pay: can't tell yet.");
  else if (g) {
    for (const x of g.pay_at_most) out.push('You pay at most ' + amt(x) + ' in all.'); // 10
    for (const x of g.hand_over_at_most) out.push('You hand over at most ' + amt(x) + ' in all.'); // 10
    out.push(g.can_lose.length ? 'It can give away up to these ' + and(g.can_lose.map(amt)) + '.' : 'It can give away nothing of yours.'); // 11
    if (g.meter_own) out.push('A copied key could show this to several sellers.'); // 12
    for (const f of g.floor) out.push(cap(who(g.holder)) + ' may sell for as little as ' + amt(f.amount) + ' per ' + amt(f.per) + '. Every buyer can read this.'); // 13
    if (g.clocks) {
      const names = g.clocks.hear.map(c => (c.block ? whose(c.of) + ' key ' + c.block.code : who(c.of)));
      if (g.clocks.one) out.push('Only ' + names[0] + ' hears your STOP' + (g.backed_by.length ? '; if it misses it, ' + who(g.backed_by[0]) + ' pays you back.' : '.')); // 15
      else if (g.clocks.all) out.push(cap(and(names)) + ' must ' + (names.length === 2 ? 'both' : 'all') + ' hear each deal. If ' + (names.length === 2 ? 'either' : 'one') + ' is silent, deals wait.'); // 14
      else out.push(cap(and(names)) + ' hear each deal and your STOP.');
    }
    if (g.pays) out.push("What it can move on your bank is your bank's limit, not this."); // 20
  }
  return out.join('\n');
}
const n = k => String(k);
module.exports = { en };
