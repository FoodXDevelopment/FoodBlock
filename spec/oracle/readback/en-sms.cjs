'use strict';
// spec/renderers/en-sms (renderers/en-sms.md): the same answer (readings/readback) into short English for a basic phone. Not normative; named by the SHA-256 of this file's bytes.
// The same lines as `en`, shorter, joined by spaces; GSM-7 characters only. A decision text (this, a space, the digits) is at most 160 GSM-7 characters (07 §4).
// It reads the answer only, never a block, reads no free text, classifies nothing; no rule set, no fraction, no `needed` or `names`.
function enSms(a) {
  const me = a.viewer ? a.viewer.id : null;
  const seen = new Set();
  const who = p => {
    if (!p) return 'an id not named';
    if (p.id === me) return 'you';
    if (p.name === null) { if (seen.has(p.id)) return 'that id'; seen.add(p.id); return 'unnamed id ' + p.code; }
    if (seen.has(p.id)) return p.name;
    seen.add(p.id); return p.name + ' ' + p.code;
  };
  const whose = p => (p && p.id === me ? 'your' : who(p) + "'s");
  const says = p => (p && p.id === me ? 'you say' : who(p) + ' says');
  const thing = t => { if (t.name === null) return t.code; if (seen.has(t.id)) return t.name; seen.add(t.id); return t.name + ' ' + t.code; };
  const amt = x => x.value + ' ' + x.unit;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const and = l => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]);
  const out = [];
  const signer = a.for.signer;
  if (signer && signer.id !== me) out.push(cap(who(signer)) + ':'); // 17
  else if (a.other) out.push('To ' + who(a.other) + ':');
  if (a.not_valid) { out.push('no key signed this as it is.'); return out.join(' '); }
  if (a.not_shown) { out.push("can't tell yet; " + a.lacks.length + ' of ' + whose(signer) + ' blocks missing.'); return out.join(' '); }
  if (a.not_read) { // 19
    out.push(a.not_read.rule_set && !a.not_read.fields ? "your reader can't read the rules this names; nothing guessed." : "your reader can't read " + (a.not_read.fields <= 1 ? '1 field' : a.not_read.fields + ' fields') + ' here; nothing guessed.');
    return out.join(' ');
  }
  if (a.first_deal && signer && signer.id !== me) out.push('First deal with this ' + (a.other_side === 'to' ? 'buyer.' : 'seller.')); // 17
  if (a.audience !== 'public' && signer && signer.id !== me) out.push(a.audience.readers + ' readers; you see only yourself.'); // 18
  if (a.what) out.push('In ' + whose(a.what.by) + ' words: "' + a.what.text + '".'); // the deal's own words, quoted word for word, never read
  for (const l of a.things) {
    const T = () => thing(l.what), to = l.to, mine = to && to.id === me;
    if (l.what.pack && mine && l.draw && l.draw.state === 'held') out.push(T() + ': ' + amt(l.what.pack) + ', ' + whose(l.what.stated_by) + ' word.'); // 9
    const d = l.draw;
    if (l.pair && !(d && d.why === 'pair')) out.push(T() + ': ' + who(l.by) + ' signed it twice.'); // 7, where the fold reads one draw of the pair alone
    if (d === 'not_drawn') continue;
    if (d === null) { if (l.amount && mine && l.by && l.by.id !== me && signer && l.by.id === signer.id) out.push(T() + ' ' + amt(l.amount) + ': ' + whose(l.by) + ' word; nothing set aside.'); continue; } // 4
    if (d.not_shown) { out.push(T() + ": can't tell yet; " + d.lacks.length + ' of ' + whose(l.by) + ' blocks missing.'); continue; } // 5
    if (d.state === 'landed') { out.push(T() + ': ' + (mine ? 'yours' : whose(to)) + '.'); continue; } // 1
    if (d.state === 'held' && l.holder) { out.push(T() + ': held for ' + who(to) + ' by ' + who(l.holder) + ' till ' + says(l.freer) + ' no.'); continue; } // 3
    if (d.state === 'held') { out.push(T() + ': kept for ' + who(to) + ' in ' + whose(l.by) + ' hands till ' + says(l.freer) + ' no.'); continue; } // 2
    if (d.state === 'freed') { out.push(T() + ': freed; ' + who(l.by) + ' may sell it again.'); continue; } // 8
    if (d.why === 'past' || d.why === 'not_owner') { out.push(T() + ': not ' + whose(l.by) + ' to give.'); continue; } // 6
    if (d.why === 'pair') { out.push(T() + ': ' + who(l.by) + ' signed it twice' + (l.pair && l.pair.some(p => p.to && p.to.id === me) ? '; neither shown as yours.' : '.')); continue; } // 7
    if (d.why) { out.push(T() + ': ' + whose(l.by) + ' word takes none of it.'); continue; }
    out.push(T() + ": can't tell yet.");
  }
  for (const m of a.money) if (m.to && m.to.id === me && m.by && m.by.id !== me && signer && m.by.id === signer.id) out.push(amt(m.amount) + ' to you: ' + whose(m.by) + ' word; nothing set aside.'); // 4
  const mineAmts = a.amounts.find(s => s.side && s.side.id === me);
  const moneyKinds = new Set(a.money.map(m => m.amount.unit + '|' + (m.amount.of || '')));
  if (mineAmts) { // 10
    for (const x of mineAmts.out) if (moneyKinds.has(x.unit + '|' + (x.of || ''))) out.push('You pay max ' + amt(x) + '.');
    for (const x of mineAmts.in) if (moneyKinds.has(x.unit + '|' + (x.of || ''))) out.push('You may get as little as ' + amt(x) + '.');
  }
  if (a.terms && a.terms.waits_on === 'price') out.push(cap('done when ' + says(a.money[0] ? a.money[0].to : null) + ' so.')); // 16
  if (a.terms && a.terms.waits_on === 'goods') out.push(cap('pay when ' + says(a.money[0] ? a.money[0].by : null) + ' it came.')); // 16
  const g = a.grant;
  if (g && g.not_shown) out.push("Most you can be made to pay: can't tell yet.");
  else if (g) {
    for (const x of g.pay_at_most) out.push('You pay max ' + amt(x) + '.'); // 10
    for (const x of g.hand_over_at_most) out.push('You hand over max ' + amt(x) + '.'); // 10
    out.push(g.can_lose.length ? 'It can give away up to ' + and(g.can_lose.map(amt)) + '.' : 'It can give away nothing of yours.'); // 11
    if (g.meter_own) out.push('A copied key could show this to several sellers.'); // 12
    for (const f of g.floor) out.push(cap(who(g.holder)) + ' may sell at ' + amt(f.amount) + ' per ' + amt(f.per) + ' or more; every buyer sees it.'); // 13
    if (g.clocks) {
      const names = g.clocks.hear.map(c => (c.block ? whose(c.of) + ' key ' + c.block.code : who(c.of)));
      if (g.clocks.one) out.push('Only ' + names[0] + ' hears your STOP' + (g.backed_by.length ? '; if it misses it, ' + who(g.backed_by[0]) + ' pays you back.' : '.')); // 15
      else if (g.clocks.all) out.push(cap(and(names)) + ' must ' + (names.length === 2 ? 'both' : 'all') + ' hear each deal.'); // 14
      else out.push(cap(and(names)) + ' hear each deal and your STOP.');
    }
    if (g.pays) out.push("Your bank's limit, not this, caps what it moves there."); // 20
  }
  return out.join(' ');
}
module.exports = { enSms };
