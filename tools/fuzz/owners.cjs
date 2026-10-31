'use strict';
// Invariant 32 as a property (folds.md): owners change only for one of three reasons. Given the answer of the ownership fold for a thing and
// the blocks held, every change of `owner` has a transfer signed for the previous owner, or is the maker's first use. The "attacker's own signed
// payment after a ruling" is itself a transfer signed for the previous owner, so no fourth path exists in the fold. Returns null when the
// answer keeps it, else a sentence. A block signed under a grant speaks for its grantor, which this check does not read, so it stops there.
function ownersHaveReasons(thing, held, result) {
  const by = new Map(held.map((b) => [b.hash, b]));
  if (!by.has(thing.hash)) by.set(thing.hash, thing);
  if (thing.type === 'actor') return result.owner === null || result.owner === undefined ? null : 'an actor has an owner';
  if (thing.refs && thing.refs.under) return null;
  // a kind (some counted block names the thing in refs.of) is a description and has no owner (things.md); whether a naming block counts is the fold's to say, so this check stops there
  if (held.some((b) => b.refs && b.refs.of === thing.hash)) return null;
  // produce of a thing: an output of a keep begins with the owner of the thing kept, which this check does not read (first use of what the means made)
  if ([].concat((thing.refs && thing.refs.derives_from) || []).some((h) => { const k = by.get(h); return k && k.type === 'transform' && k.refs && k.refs.subject && !k.refs.derives_from; })) return null;
  let prev = (thing.refs && thing.refs.as) || (thing.refs && thing.refs.author) || null;
  let letGo = false;
  for (const h of result.transfers || []) {
    const t = by.get(h);
    if (!t || t.type !== 'transfer') return `owner changed by ${h.slice(0, 8)}, which is no transfer`;
    if ([].concat(t.refs.what || []).indexOf(thing.hash) < 0) return `owner changed by ${h.slice(0, 8)}, which does not name the thing`;
    if (t.refs.under) return null;
    const signer = t.refs.as || t.refs.author;
    // after an open hand-over the title ended; whoever took the thing by first use afterwards is the next owner (things.md, Letting go with no receiver)
    if (letGo && held.some((b) => b.type === 'transform' && b.refs && b.refs.subject === thing.hash && !b.refs.derives_from && (b.refs.as || b.refs.author) === signer)) prev = signer;
    if (signer !== prev) return `owner changed by ${h.slice(0, 8)} signed by ${String(signer).slice(0, 8)}, not by the previous owner ${String(prev).slice(0, 8)}`;
    prev = [].concat(t.refs.to_owner || [])[0] || null;
    letGo = prev === null;
  }
  // the final owner may be the first-use taker after an open hand-over: the reason is first use
  if (letGo && result.owner && held.some((b) => b.type === 'transform' && b.refs && b.refs.subject === thing.hash && !b.refs.derives_from && (b.refs.as || b.refs.author) === result.owner)) return null;
  if (prev !== null && result.owner !== undefined && result.owner !== null && result.owner !== prev && !result.conflict) return `owner ${String(result.owner).slice(0, 8)} is not the end of the chain`;
  return null;
}
module.exports = { ownersHaveReasons };
