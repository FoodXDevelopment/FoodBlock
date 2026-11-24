'use strict';
// Invariant 24 as a property (folds.md, Ownership): owners change only for one of two reasons, so every owner the ownership fold shows can name
// its reason from `draws`: she made it or it is hers by its own block (a first owner), it was handed to her by a draw that landed, or she took
// what a let-go left by first use. Given the fold's answer for a thing and the blocks given, returns null when every owner shown has a reason,
// else a sentence. Who owns an output first (the owners of what its makes took) is the fold's own reading, so this check stops at an output.
function ownersHaveReasons(thing, blocks, result) {
  if (!result || result.not_shown) return null;
  // A circle that states `pack` has owners, its parts (circles.md); any other actor has none
  if (thing.type === 'actor' && !(thing.state && thing.state.kind === 'circle' && thing.state.pack)) return (result.owners || []).length ? 'an actor has an owner' : null;
  const first = new Set([thing.refs && (thing.refs.as || thing.refs.author)].filter(Boolean));
  const madeOrKept = [].concat((thing.refs && thing.refs.derives_from) || []).length > 0;
  const handed = new Set((result.draws || []).filter((d) => d.takes && d.state === 'landed' && typeof d.to === 'string' && d.to !== 'open').map((d) => d.to));
  const takers = new Set(blocks.filter((b) => b.type === 'transform' && b.refs && b.refs.subject === thing.hash && !b.refs.derives_from).map((b) => b.refs.as || b.refs.author));
  for (const o of result.owners || []) {
    if (first.has(o.owner) || handed.has(o.owner) || takers.has(o.owner) || madeOrKept) continue;
    // a block signed under a grant speaks for its grantor, which this check does not read
    if (blocks.some((b) => b.refs && b.refs.under)) continue;
    return `owner ${String(o.owner).slice(0, 8)} has no reason shown in draws`;
  }
  return null;
}
module.exports = { ownersHaveReasons };
