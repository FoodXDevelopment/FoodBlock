'use strict';
// The oracle's part for consent and admission (consent.md).
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Circles = require('./circles.cjs');
const Deals = require('./deals.cjs');
const Grants = require('./grants.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
// ================================================================ consent and admission (consent.md)
// namesOf(sender, block, pool): who a sender is named by (consent follows the principal): itself, and whom its block speaks for
// (folds.md, Who a block speaks for: the one speaker rule, scope included). Without the sender's block, itself alone.
function namesOf(sender, block, pool) {
  const out = [sender];
  if (block && block.refs && block.refs.author === sender) {
    const p = Things.speakerOf(block, pool.get(block.hash) ? pool : new Check.Pool([...pool.all(), block], true));
    if (p !== null && p !== undefined && !out.includes(p)) out.push(p);
  }
  return out;
}
function consentFold(person, sender, blocks, block) {
  const pool = Check.poolOf(blocks);
  const has = sender !== undefined && sender !== null;
  const names = has ? namesOf(sender, block, pool) : [];
  // A recorder binds only its own side: it is named.
  const sideOf = (recorder) => has && names.includes(recorder);
  const personOf = b => b.refs.from !== undefined ? b.refs.from : b.refs.author;
  // her own word: a block about her that is backed by her (her signature, or a chain of her grants that covers it: a witness a host signs under her grant)
  const hers = b => (b.refs.from === undefined || b.refs.from === person) && isHers(b, person, pool);
  const all = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'consent' && (personOf(b) === person || hers(b)) && Identity.counts(b, pool) &&
    Basics.C.folds.consent.word_values.includes(b.state.word) && // a word outside yes and stop counts for nothing (readings/consent.md)
    !(b.state.word === 'yes' && Check.asList(b.refs.subject).length === 0)); // a yes widens, so it names whom it is about; one that names no one counts for nothing
  const stops = all.filter(b => b.state.word === 'stop');
  const cons = all.filter(b => {
    if (hers(b)) return true;
    if (b.state.word === 'stop') return sideOf(b.refs.author);
    // A recorder's yes counts only for its own side, as the lift of a stop the same recorder recorded, in its causal past: her own stop
    // is lifted by her own block alone (consent.md, Only the person lifts a STOP)
    if (b.state.word === 'yes') return sideOf(b.refs.author) && !stops.some(st => hers(st) && pool.sees(b.hash, st.hash)) && stops.some(st => st.refs.author === b.refs.author && st.refs.from === person && pool.sees(b.hash, st.hash));
    return false;
  });
  const later = (a, b) => pool.sees(a.hash, b.hash) || (a.state.seq > b.state.seq && Identity.signerKeyOf(a, pool) === Identity.signerKeyOf(b, pool));
  const decide = group => {
    if (!group.length) return null;
    const maximal = group.filter(a => !group.some(b => b !== a && later(b, a)));
    const stop = maximal.filter(b => b.state.word === 'stop').sort(Basics.byHash)[0];
    if (stop) return stop;
    // A tie between other words leaves no live word; a tie that agrees stands, naming the lowest hash.
    if (maximal.some(b => b.state.word !== maximal[0].state.word)) return null;
    return maximal.sort(Basics.byHash)[0];
  };
  const aboutThem = cons.filter(b => b.refs.subject !== undefined && names.includes(b.refs.subject));
  const named = aboutThem.length ? decide(aboutThem) : undefined;
  const pick = aboutThem.length ? named : decide(cons.filter(b => b.refs.subject === undefined));
  return pick ? { word: pick.state.word, block: pick.hash } : { word: null, block: null };
}
// isStranger(receiver, sender, blocks, block): a stranger to a sender (consent.md) is someone who has dealt with none of the sender's blocks, or of those
// it is named by, and has no live yes of her own for it. Consent follows the principal: the sender is named by itself and whom its block
// speaks for (`block`, the sender's own block, lets the fold name that one).
function isStranger(receiver, sender, blocks, block) {
  const pool = Check.poolOf(blocks);
  const names = namesOf(sender, block, pool);
  // only her accept, her counter-offer or a deal she opened with him makes a sender no stranger: a counted block of hers that answers
  // one of his accepted, or as a counter (a promise with no status), or a promise of hers, no answer and no stop, naming him as a side. A declined or
  // stopped answer, or any other, keeps him a stranger. Only a block that counts: a forked one binds no one (core.md, invariant 3)
  const answersHis = b => Check.asList(b.refs.answers).some(h => { const t = pool.get(h); return t && names.includes(t.refs.author); });
  const dealt = pool.all().some(b => Identity.binds(b, pool) &&
    ((answersHis(b) && (b.state.status === 'accepted' || (b.type === 'promise' && b.state.status === undefined))) ||
     (b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined && b.state.status === undefined && ['from', 'to'].some(k => Basics.isStr(b.refs[k]) && names.includes(b.refs[k])))) && (b.refs.author === receiver || isHers(b, receiver, pool)));
  // a recorder's yes lifts only a stop it recorded: only the receiver's own yes ends strangerhood (consent.md)
  const consent = consentFold(receiver, sender, pool, block);
  const yes = consent.word === 'yes' && Boolean(pool.get(consent.block)) && isHers(pool.get(consent.block), receiver, pool);
  return !dealt && !yes;
}
// admission_refusals(block, recipient, blocks, rule, arrivedToday): the message refusals of nodes.md and consent.md
function admissionRefusals(block, recipient, blocks, rule, today) {
  const pool = Check.poolOf(blocks);
  rule = rule || {};
  const out = [];
  const author = block.refs.author;
  // an autonomous system, or a block under a grant
  const isAgent = Check.autonomous(author, pool) || block.refs.under !== undefined;
  // consent follows the principal (consent.md): one who answered the sender, or whom its block speaks for (the grantor of the live grant it acts under), is no stranger
  const stranger = isStranger(recipient, author, pool, block);
  // a listed party is exempt from the count only for a block whose key still speaks for that party (nodes.md, Admission): a block of a key that does not
  // speak for her there is counted as anyone else's
  const speaksForAuthor = () => { const p = pool.get(block.hash) ? pool : new Check.Pool([...pool.all(), block]); return Identity.identityFold(author, p).signed_by_author[block.hash] === true; };
  const listed = Check.asList(rule.parties).includes(author) && speaksForAuthor();
  // only a rule that states an order channel refuses: with none, what the node does is its own software's choice (consent.md)
  if (stranger && isAgent && rule.order_channel !== undefined) {
    // the order channel is a list of types; anything else names none
    const channel = Array.isArray(rule.order_channel) && rule.order_channel.some(n => Grants.typeNames(block).includes(n));
    if (!channel) out.push({ code: 'not_human', detail: 'a first block to a stranger that an autonomous system signed, outside the receiver\'s order channel' });
  }
  // per_stranger counts asks, each sender outside parties alone (nodes.md, Admission): an ask is a block that names one of the node's people in a ref; a block's pieces, and the
  // blocks its answer reads, are never counted. The block asked about is an ask when it names the receiver in a ref other than refs.author; one that is no ask is never
  // refused by the count, and `today` is the asks the node took from this sender.
  const isAsk = Object.entries(block.refs).some(([k, v]) => k !== 'author' && Check.asList(v).includes(recipient));
  if (!listed && isAsk && Number.isInteger(rule.per_stranger) && rule.per_stranger >= 0 && today >= rule.per_stranger) out.push({ code: 'not_admitted', detail: 'the node took its per_stranger asks for the day' });
  const order = Object.keys(Basics.P.refusals.codes.message);
  return out.sort((x, y) => order.indexOf(x.code) - order.indexOf(y.code));
}
// speaksFor(block, blocks): the one party a fold counts a block for (authority.md, Who a block speaks for): the circle if it is signed `as` one by an author
// who may sign for it, else the grantor of the live grant it acts under, else its author. null when it speaks for no one: signed as a circle by an author
// without the hands the circle needs (no_role), or a block no node would take, which is no word (folds.md). It is read with the blocks as if it were given.
// No clock: the block's own date tests a grant's `expires`. A genesis has no author to speak for.
function speaksFor(block, blocks) {
  if (!Basics.isObj(block)) throw Bytes.argError('argument 0 is a block');
  const pool = Bytes.readWith(blocks, block);
  const mine = pool.get(block.hash);
  if (!mine) return null;
  const who = Things.speakerOf(mine, pool);
  return who === undefined ? null : who;
}
// backed(block, person, blocks): is this block backed by the person (authority.md, Backed by a person)? { backed, why, chain }. Backed when the person signed it
// (their key speaks for them), or it is signed as a circle by one who may sign for it and the person holds `sign` in the circle's fold of the block's causal past,
// or a grantee signed it under a grant that passes the door's test (whyNotUnder: made for its signer, live at the block's own place, covering it) and whose
// chain (refs.parent, to the first grant not passed on) roots in the person's signature, or in a circle the person holds `sign` in. No clock, no arrival.
function backed(block, person, blocks) {
  if (!Basics.isObj(block)) throw Bytes.argError('argument 0 is a block');
  if (!Basics.isStr(person)) throw Bytes.argError('person is an id (text)');
  const pool = Bytes.readWith(blocks, block), r = backedIn(block, person, pool);
  if (r.backed || block.refs.under === undefined || !pool.get(block.hash)) return r;
  // a pair on the grant's line gives { pair: true, blocks, at_most }; a line not read whole { not_shown, lacks }; a block or a grant in its chain that is waiting lists it
  const w = Grants.whyNotUnder(block, pool);
  if (w.length && w[0].code === 'pair') { const g = pool.get(block.refs.under); return { backed: w[0].pair, why: null, chain: [block.hash, ...(g ? Grants.grantChain(g, pool).map(x => x.hash) : [])] }; }
  if (w.length && w[0].code === 'not_shown') return { not_shown: true, lacks: w[0].lacks };
  if (w.length && w[0].code === 'waiting') return { ...r, waiting: w[0].waiting };
  return r;
}
// the same, for a whole set at once: { hash: { backed, why } }, each the verdict `backed` gives among the same blocks
function backedAll(person, blocks) {
  if (!Basics.isStr(person)) throw Bytes.argError('person is an id (text)');
  const pool = Check.poolOf(blocks), out = {};
  for (const b of Check.asList(blocks)) if (Basics.isStr(b.hash) && !(b.hash in out)) { const r = backedIn(b, person, pool); out[b.hash] = { backed: r.backed, why: r.why }; }
  return out;
}
// whether a block is the person's own word: backed by them (authority.md, Backed by a person)
const isHers = (b, person, pool) => backedIn(b, person, pool).backed;
function backedIn(block, person, pool) {
  const b = pool.get(block.hash);
  const no = (why, chain) => ({ backed: false, why, chain });
  if (!b) return no('the block is no word: it is not valid on what it rests on, or rests on a block not held', []);
  const chain = [b.hash];
  if (!Identity.counts(b, pool)) return no('its signer\'s key does not speak for its author here (no voice of her standing list, an end it has seen, or a fork: a fork counts for nothing)', chain);
  let root, topBlock = b;
  if (b.refs.as !== undefined) {
    if (!Circles.mayActAsIn(b, b.refs.as, pool)) return no('it is signed as a circle and no row of the circle holds for it, nor did every owner sign it: it is waiting on hands and acts on nothing (no_role)', chain);
    root = b.refs.as;
  } else if (b.refs.author === person) return { backed: true, why: null, chain };
  else if (b.refs.under !== undefined) {
    const wrong = Grants.whyNotUnder(b, pool);
    if (wrong.length) return no(b.refs.author + ' signed it under a grant that does not back it: ' + wrong.map(w => w.code + ': ' + (w.code === 'pair' ? JSON.stringify(w.pair) : w.detail)).join('; '), chain);
    let g = pool.get(b.refs.under);
    for (;;) { chain.push(g.hash); const up = g.refs.parent === undefined ? null : pool.get(g.refs.parent); if (!up) break; g = up; }
    root = Things.principalOf(g, pool); // g is grantTop(pool.get(b.refs.under), pool), walked here for the chain
    topBlock = g;
    if (root === null) return no('the grant at the top of its chain is signed as a circle by one who may not sign for it', chain);
  } else return no('it is signed by ' + b.refs.author + ', who is not ' + person + ', and names no grant', chain);
  if (root === person) return { backed: true, why: null, chain };
  const C = pool.get(root);
  // P signed a hand of the circle it is signed as: a hand of P's is among those its row counted (circles.md, authority.md Backed by a person)
  if (Circles.isFoundingCircle(C) && b.refs.as === root) { const rh = Circles.circleHolds(b, pool); if (rh && rh.holds && rh.hands.some(h => h.id === person && h.counts)) return { backed: true, why: null, chain }; }
  return no('its chain roots in ' + root + ', and ' + person + ' is neither ' + root + ' nor one of the hands that sign for it', chain);
}
// gives(block, person, blocks): what of the person's would become whose if the block stands (promises.md, What becomes whose). { gives: [line] }.
function gives(block, person, blocks) {
  if (!Basics.isObj(block)) throw Bytes.argError('argument 0 is a block');
  if (!Basics.isStr(person)) throw Bytes.argError('person is an id (text)');
  const pool = Bytes.readWith(blocks, block), r = givesIn(block, person, pool);
  // the bench of the deal the block belongs to, the same answer `promise_stage` gives, or `none`
  const first = block.type === 'promise' && block.refs.answers === undefined ? pool.get(block.hash) : Check.asList(block.refs.for).map(h => pool.get(h)).find(x => x && x.type === 'promise' && x.refs.answers === undefined);
  const st = first ? Deals.promiseStage(first, pool) : null;
  return { ...r, bench: st && !st.not_shown && st.bench ? st.bench : 'none' };
}
function givesIn(block, person, pool) {
  // a transfer moves the things of whoever's word it is (the top of its chain), and only if that person backs it: the reading `backed` makes
  // (a block not yet signed, the read-back shown before she signs, has no signature to judge: it is read as its signed form would be)
  if (block.type === 'transfer' && !(claimedBy(block, pool) === person && (block.signature === undefined || backedIn(block, person, pool).backed))) return { gives: [] };
  return linesIn(block, person, pool);
}
// whose word a block says it is, before anyone judges it: the circle it is signed `as`, else the top of the grant chain it names, else its author
function claimedBy(b, pool) {
  if (b.refs.as !== undefined || b.refs.under === undefined) return Things.principalOf(b, pool);
  const g = pool.get(b.refs.under);
  return g ? Things.principalOfChain(g, pool) : null;
}
// the lines of a block read as if the person backed it, with no judgement of who signed it (toComeBack asks them of a transfer `backed` refused)
function linesIn(block, person, pool) {
  const line = (parts, to, back) => ({ ...parts, to: to === undefined ? null : to, back: back === undefined ? null : back });
  // a thing is hers as of the block's own place in time (its causal past), never by today's owner; a thing not given is not hers, and is listed in `unplaced` (no line, but never "nothing"); a given kind is a description
  // with no owner, and promising goods of a kind is her own word
  const unplaced = [];
  const hers = w => { const t = pool.get(w); if (!t) { unplaced.push(w); return false; } if (!t.refs || t.refs.of === undefined) return true; return Things.ownershipFold(t, pool, block.signature === undefined && !(pool._assumed && pool._assumed.has(block.hash)) ? undefined : pool.past(block.hash)).owners.some(o => o.owner === person); };
  const out = [];
  if (block.type === 'promise') {
    let deal = block, chosen;
    const st = block.state && block.state.status;
    if (st !== undefined) {
      const d = st === 'accepted' && block.refs && block.refs.answers ? pool.get(block.refs.answers) : undefined;
      if (!d || d.type !== 'promise') return { gives: [] };
      deal = d; chosen = block.state.terms && block.state.terms.lines;
    }
    const terms = Basics.isObj(deal.state.terms) ? deal.state.terms : {}, from = deal.refs.from, to = deal.refs.to, until = Basics.isStr(terms.until) ? terms.until : undefined;
    if (from === person) {
      // this of mine becomes yours: each thing its lines name, with the quantity chosen; a line that names no thing, the amount its quantity states (a loan of money)
      for (const l of Check.linesOf(terms)) {
        const w = l.what, q = Check.quantityOf(l, chosen);
        if (w === undefined) { if (Basics.isObj(q) && q.unit !== undefined) out.push({ ...line({ amount: q }, to, null), held: false }); continue; }
        if (!Basics.isStr(w) || !hers(w)) continue;
        const amount = Basics.isObj(q) && q.unit !== undefined && q.value !== undefined ? { amount: q } : {};
        // an offer that names an instance of its signer's and a receiver other than himself holds it from his own word (`held`); a yes to an order holds nothing
        const t = pool.get(w), instance = !!t && t.refs.of !== undefined;
        out.push({ ...line({ what: w, ...amount }, to, until), held: instance && st === undefined && block.refs.answers === undefined && Basics.isStr(to) && to !== from });
      }
    }
    if (to === person) {
      const total = Deals.termsTotal(terms, chosen);
      if (total) out.push({ ...line({ amount: total }, from, null), held: false });
    }
  } else if (block.type === 'transfer') {
    if (block.state && block.state.status !== undefined) return { gives: [] };
    const owner = block.refs.to_owner, holder = block.refs.to_holder;
    let until;
    for (const d of Check.asList(block.refs.for)) { const x = pool.get(d); if (x && x.state && Basics.isObj(x.state.terms) && Basics.isStr(x.state.terms.until)) { until = x.state.terms.until; break; } }
    const amt = Deals.isAmount(block.state.amount) ? block.state.amount : null;
    if (amt && Check.asList(block.refs.what).length === 0) out.push({ ...line({ amount: amt }, owner, null), held: false });
    for (const w of Check.asList(block.refs.what)) {
      // a transfer that names an instance of hers and a receiver holds it from her word until it lands or is freed
      const t = pool.get(w), instance = !!t && t.refs.of !== undefined;
      if (owner !== undefined && hers(w)) out.push({ ...line({ what: w, ...(amt ? { amount: amt } : {}) }, owner, null), held: instance });
      else if (owner === undefined && holder !== undefined) out.push({ ...line({ what: w, ...(amt ? { amount: amt } : {}) }, holder, until), held: false });
    }
  }
  const unique = [...new Set(unplaced)].sort();
  return { gives: out.filter(l => l.to !== person), ...(unique.length ? { unplaced: unique } : {}) };
}
// toComeBack(person, blocks): an amount moved in the person's name that they do not back (promises.md, What becomes whose). { to_come: [{ block, amount, to, why }] }:
// each transfer of `blocks` whose money is the person's by `gives` and that `backed` says they do not back. A transfer no node would hold is not backed either.
function toComeBack(person, blocks) {
  if (!Basics.isStr(person)) throw Bytes.argError('person is an id (text)');
  const pool = Check.poolOf(blocks), seen = new Set(), toCome = [];
  for (const b of Check.asList(blocks)) {
    if (b.type !== 'transfer' || seen.has(b.hash)) continue;
    seen.add(b.hash);
    const read = pool.get(b.hash) ? pool : Bytes.readWith(blocks, b);
    const verdict = backedIn(b, person, read);
    if (verdict.backed) continue;
    if (claimedBy(b, read) !== person) continue;
    for (const l of linesIn(b, person, read).gives) if (l.amount !== undefined && l.what === undefined) toCome.push({ block: b.hash, amount: l.amount, to: l.to, why: verdict.why });
  }
  return { to_come: toCome };
}

// ---- the market's shapes (promises.md: Finding, A signed check, Clearing, Rulings) ----
// an amount as an exact fraction in its kind; null for anything else
const measureOf = m => (Deals.isAmount(m) ? { kind: Bytes.jcs(Deals.kindOf(m)), k: Deals.kindOf(m), v: Deals.dec(m.value) } : null);
const measureOut = (m, v) => Deals.amtOut(v, m.k);
const firstPromise = b => b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined;
const sortedIds = l => [...new Set(l)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
// does this person's word stand behind the block, or a block that confirms it
const signedBy = (b, p, pool) => backedIn(b, p, pool).backed || pool.all().some(c => Check.asList(c.refs.confirms).includes(b.hash) && backedIn(c, p, pool).backed);
function lookupWrong(lk) {
  if (!Basics.isObj(lk) || lk.type !== 'observe' || lk.state.kind !== 'lookup') return 'the first block is no lookup (an observe of kind lookup)';
  if (lk.state.side !== 'offer' && lk.state.side !== 'want') return 'a lookup says which side it looks for: `side` is offer or want';
  if (lk.state.terms !== undefined && !Basics.isObj(lk.state.terms)) return 'a lookup\'s `terms` is an object of the terms an item must carry';
  return null;
}
function itemWrong(lk, h, pool) {
  const b = pool.get(h);
  if (!b) return 'it is not a block the reader holds';
  if (!firstPromise(b)) return 'it is not a first promise';
  if (!Identity.counts(b, pool)) return 'its signer\'s key does not speak for its author here';
  const offer = lk.state.side === 'offer', signs = offer ? b.refs.from : b.refs.to, other = offer ? b.refs.to : b.refs.from;
  if (signs === undefined || other !== undefined || !backedIn(b, signs, pool).backed) return 'it is not the signed ' + lk.state.side + ' of one side with the other open';
  const st = Deals.promiseStage(b, pool);
  if (!st || (st.stage !== 'offered' && st.stage !== 'asked')) return 'it is no longer open';
  const wanted = Check.asList(lk.refs.what);
  if (wanted.length && !Check.whatsOf(b).some(w => wanted.includes(w))) return 'it names none of the things the lookup asks for';
  const tm = Basics.isObj(b.state.terms) ? b.state.terms : {};
  for (const [k, v] of Object.entries(lk.state.terms || {})) if (JSON.stringify(canonicalSort(tm[k])) !== JSON.stringify(canonicalSort(v))) return 'its term `' + k + '` is not the one the lookup asks for';
  return null;
}
const canonicalSort = v => Array.isArray(v) ? v.map(canonicalSort) : Basics.isObj(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonicalSort(v[k])])) : v;
function listingCheck(lookup, listing, blocks) {
  if (!Basics.isObj(lookup) || !Basics.isObj(listing)) throw Bytes.argError('arguments 0 and 1 are blocks');
  const pool = Check.poolOf(blocks), none = why => ({ ok: false, why, bad: [], left_out: [] });
  const w = lookupWrong(lookup);
  if (w) return none(w);
  if (listing.type !== 'observe' || listing.state.kind !== 'listing') return none('the second block is no listing (an observe of kind listing)');
  if (listing.refs.answers !== lookup.hash) return none('the listing does not answer this lookup');
  const named = sortedIds(Check.asList(listing.refs.derives_from));
  const bad = [];
  for (const h of named) { const why = itemWrong(lookup, h, pool); if (why) bad.push({ hash: h, why }); }
  const left = sortedIds(pool.all().map(b => b.hash).filter(h => !named.includes(h) && itemWrong(lookup, h, pool) === null));
  return { ok: bad.length === 0, why: bad.length ? bad[0].hash + ': ' + bad[0].why : null, bad, left_out: left };
}
function checkReads(check, blocks) {
  if (!Basics.isObj(check)) throw Bytes.argError('argument 0 is a block');
  const pool = Check.poolOf(blocks), no = (why, read) => ({ ok: false, why, read: read || [] });
  if (check.type !== 'observe' || check.state.kind !== 'check') return no('the block is no check');
  const subject = check.refs.subject;
  if (!Basics.isStr(subject)) return no('a check names the one whose record it read');
  const named = sortedIds(Check.asList(check.refs.derives_from));
  if (!named.length) return no('a check names what it read');
  let wrong = null;
  const read = named.map(h => {
    const b = pool.get(h), has = !!b;
    const concerns = has && (backedIn(b, subject, pool).backed || [b.refs.from, b.refs.to].includes(subject));
    const st = has && firstPromise(b) ? Deals.promiseStage(b, pool) : null;
    const stage = st ? st.stage : null;
    if (wrong === null) {
      if (!has) wrong = h + ' is not held';
      else if (!concerns) wrong = h + ' is not the subject\'s';
      else if (check.state.of !== undefined && b.type !== check.state.of) wrong = h + ' is not of the type the check says';
      else if (check.state.stage !== undefined && stage !== check.state.stage) wrong = h + ' is not at the stage the check says';
    }
    return { hash: h, has, concerns, stage };
  });
  if (wrong === null && check.state.count !== undefined && check.state.count !== named.length) wrong = 'the check says it read ' + check.state.count + ', and names ' + named.length;
  return { ok: wrong === null, why: wrong, read };
}
// who is to pay the price of a deal, and to whom it is to come
function dealSides(st) {
  const debtor = st.sides && Basics.isStr(st.sides.to) ? st.sides.to : null;
  const owners = st.to_come && Array.isArray(st.to_come.from) ? st.to_come.from.map(l => l.owner).filter(Basics.isStr) : [];
  const creditors = owners.length ? sortedIds(owners) : (st.sides && Basics.isStr(st.sides.from) ? [st.sides.from] : []);
  return { debtor, creditors };
}
function clearingApplied(clearing, blocks) {
  if (!Basics.isObj(clearing)) throw Bytes.argError('argument 0 is a block');
  const pool = Bytes.readWith(blocks, clearing), stop = why => ({ binds: false, why, who: [], missing: [], lines: [] });
  if (clearing.type !== 'observe' || clearing.state.kind !== 'clearing') return stop('the block is no clearing');
  const lines = clearing.state.lines;
  if (!Array.isArray(lines) || !lines.length) return stop('a clearing lists the promises it reduces');
  const who = [], out = [];
  for (const line of lines) {
    const deal = Basics.isObj(line) && Basics.isStr(line.deal) ? line.deal : '';
    const shown = { deal, ok: false, why: null, to_come: null, reduce: null, left: null };
    const no = why => { shown.why = why; out.push(shown); };
    const first = pool.get(deal);
    if (!first || !firstPromise(first)) { no('the deal is not a first promise the reader holds'); continue; }
    const st = Deals.promiseStage(first, pool);
    if (!st) { no('the deal rests on blocks the reader does not hold'); continue; }
    const sides = dealSides(st);
    for (const p of [sides.debtor, ...sides.creditors]) if (p !== null && !who.includes(p)) who.push(p);
    if (!Deals.stageBinds(st)) { no('the deal does not bind'); continue; }
    const total = st.total ? measureOf(st.total) : null;
    if (!total) { no('the deal states no price'); continue; }
    const paidM = st.paid ? measureOf(st.paid) : null;
    const paid = paidM && paidM.kind === total.kind ? paidM.v : { n: 0n, d: 1n };
    const toCome = { n: total.v.n * paid.d - paid.n * total.v.d, d: total.v.d * paid.d };
    shown.to_come = measureOut(total, toCome);
    const red = measureOf(line.reduce);
    if (!red || Deals.fcmp(red.v, { n: 0n, d: 1n }) <= 0) { no('`reduce` is an amount above nothing'); continue; }
    shown.reduce = measureOut(red, red.v);
    let applied = red.v;
    if (red.kind !== total.kind) {
      const rate = Basics.isStr(line.rate) ? pool.get(line.rate) : undefined;
      if (!rate || rate.type !== 'observe' || rate.state.kind !== 'rate') { no('it clears one kind against another and names no rate both sides signed'); continue; }
      const parties = [sides.debtor, ...sides.creditors].filter(p => p !== null);
      if (!parties.every(p => signedBy(rate, p, pool))) { no('the rate is not signed by both sides'); continue; }
      const give = measureOf(rate.state.give), get = measureOf(rate.state.get), app = measureOf(line.applies);
      if (!give || !get || !app) { no('a rate says what is given for what is got, and the line says what it applies'); continue; }
      const prod = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
      if (give.kind !== red.kind || get.kind !== total.kind || app.kind !== total.kind || Deals.fcmp(prod(red.v, get.v), prod(app.v, give.v)) !== 0) { no('the amount applied is not the rate\'s worth of the amount reduced'); continue; }
      applied = app.v;
    }
    if (Deals.fcmp(applied, toCome) > 0) { no('it reduces the deal by more than is still to come'); continue; }
    shown.left = measureOut(total, { n: toCome.n * applied.d - applied.n * toCome.d, d: toCome.d * applied.d });
    shown.ok = true;
    out.push(shown);
  }
  const people = sortedIds(who), signed = people.filter(p => signedBy(clearing, p, pool)), missing = people.filter(p => !signed.includes(p));
  const first = out.find(l => !l.ok);
  const why = first ? first.deal + ': ' + first.why : missing.length ? missing.length + ' of those in it have not signed' : null;
  return { binds: why === null, why, who: people, missing, lines: out };
}
// ruledFor(c, pool, now): the judge's head ruling on the deal, and its award line to the person (promises.md, Rulings); { ruling, award } or { why }; null for another shape
function ruledFor(c, pool) {
  if (!Basics.isObj(c) || !('ruled' in c)) return null;
  if (![c.ruled, c.by, c.awards].every(x => Basics.isStr(x) && Check.RX.id.test(x))) return { why: 'a condition `ruled` names the deal, the judge and the person it awards to' };
  const mine = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'ruling' && o.refs.subject === c.ruled && Identity.counts(o, pool) && backedIn(o, c.by, pool).backed); // no reader's clock; the head is read in the relying block's past
  if (!mine.length) return { why: 'the judge has made no ruling on the deal' };
  const heads = mine.filter(w => !mine.some(o => o !== w && pool.sees(o.hash, w.hash)));
  if (heads.length !== 1) return { why: 'two rulings that do not see each other' };
  const award = Check.asList(heads[0].state.awards).find(l => Basics.isObj(l) && l.to === c.awards);
  return award ? { ruling: heads[0].hash, award } : { why: 'the ruling awards nothing to that person' };
}
function rulingReleases(stake, blocks) {
  if (!Basics.isObj(stake)) throw Bytes.argError('argument 0 is a block');
  const pool = Bytes.readWith(blocks, stake), no = why => ({ releases: false, to: null, amount: null, ruling: null, why });
  // a stake releases only if it binds. A promise binds once its stage says so (the accept consents to the terms that name the judge: both sides chose her);
  // a transfer is its giver's own signed move, so it counts if its key speaks for her and every deal it is `for` binds
  const stageBinds = h => { const f = pool.get(h), st = f ? Deals.promiseStage(f, pool) : null; return !!st && (['accepted', 'underway', 'done', 'reversed'].includes(st.stage) || (st.stage === 'stopped' && st.stop === 'onward')); };
  const cond = stake.type === 'promise' ? (Basics.isObj(stake.state.terms) ? stake.state.terms.condition : undefined) : stake.type === 'transfer' ? stake.state.condition : undefined;
  // a transfer rests on every deal it is `for`, and on the deal its condition `ruled` names when that is a first promise given (a ruling may be about a claim or a thing)
  const ruledDeal = Basics.isObj(cond) && Basics.isStr(cond.ruled) && pool.get(cond.ruled) && pool.get(cond.ruled).type === 'promise' && pool.get(cond.ruled).refs.answers === undefined ? [cond.ruled] : [];
  const binding = stake.type === 'promise' ? stageBinds(stake.hash) : Identity.counts(stake, pool) && [...Check.asList(stake.refs.for), ...ruledDeal].every(h => !!pool.get(h) && stageBinds(h));
  const r = ruledFor(cond, pool);
  if (r === null) return no('the stake\'s condition names no ruling');
  if (r.why) return no(r.why);
  if (!binding) return { releases: false, to: r.award.to, amount: null, ruling: r.ruling, why: 'the stake does not bind: it is not signed by both sides who name this judge, or the deal it serves is not accepted' };
  let staked = null;
  if (stake.type === 'promise') { const t = Basics.isObj(stake.state.terms) ? Deals.termsTotal(stake.state.terms) : null; staked = t ? measureOf(t) : null; } else staked = measureOf(stake.state.amount);
  const awarded = measureOf(r.award.amount);
  let money = null;
  if (staked) {
    if (awarded && awarded.kind !== staked.kind) return no('the award is in another kind than the stake');
    money = measureOut(staked, awarded && Deals.fcmp(awarded.v, staked.v) < 0 ? awarded.v : staked.v);
  }
  return { releases: true, to: r.award.to, amount: money, ruling: r.ruling, why: null };
}
// rulingHonoured(ruling, blocks): a reading, whether each award of a judge's ruling was honoured (promises.md, Rulings). { lines: [{ to, due, honoured }], why }.
// An award with a sum is honoured by counted transfers `for` the ruling `to_owner` the one it awards that add up to it in its kind, whoever paid; one with no sum only by
// her release of the ruling. `due` is the award's own, or null: whether it was honoured by then is the reader's, against her own clock. A fact, never a verdict.
function rulingHonoured(ruling, blocks) {
  if (!Basics.isObj(ruling)) throw Bytes.argError('argument 0 is a block');
  const pool = Bytes.readWith(blocks, ruling), out = (lines, why) => ({ lines, why });
  if (ruling.type !== 'observe' || ruling.state.kind !== 'ruling') return out([], 'the block is no ruling (an observe of kind ruling)');
  const judge = Identity.counts(ruling, pool) ? Things.speakerOf(ruling, pool) : null;
  if (!judge || !backedIn(ruling, judge, pool).backed) return out([], 'no judge\'s key speaks for this ruling');
  const paidIn = l => {
    const want = measureOf(l.amount);
    if (want === null) return false;
    let tot = { n: 0n, d: 1n };
    for (const t of pool.all()) {
      if (t.type !== 'transfer' || t.state.status !== undefined || !Check.asList(t.refs.for).includes(ruling.hash) || !Basics.isStr(l.to) || !Check.asList(t.refs.to_owner).includes(l.to) || !Identity.counts(t, pool)) continue;
      const m = measureOf(t.state.amount);
      if (m && m.kind === want.kind) tot = { n: tot.n * m.v.d + m.v.n * tot.d, d: tot.d * m.v.d };
    }
    return Deals.fcmp(tot, want.v) >= 0;
  };
  const released = l => pool.all().some(r => r.type === 'observe' && r.state.kind === 'release' && r.state.status === undefined && r.refs.subject === ruling.hash && Basics.isStr(l.to) && Identity.counts(r, pool) && Things.speakerOf(r, pool) === l.to);
  const lines = Check.asList(ruling.state.awards).filter(Basics.isObj).map(l => ({ to: Basics.isStr(l.to) ? l.to : null, due: Basics.isStr(l.due) ? l.due : null, honoured: paidIn(l) || released(l) }));
  return out(lines, 'each award: paid in full in its kind, or released by the one it awards');
}
// feeBack(offer, deal, blocks): what a judge's fee back comes to when the sides settle (promises.md, Rulings). { settled, releases, to_come, why }.
// The offer is hers: a first promise under the base schema `judging`, refs.from the judge and backed by her, refs.to open, with terms.conciliation true and
// terms.fee_back a decimal 0 to 1. The sides settle when each of the deal's two sides has signed a release (an observe of kind release, no status, refs.subject
// the deal) and neither release has a ruling of hers on the deal (an observe of kind ruling, refs.subject the deal, backed by her) in its causal past.
// to_come lists, per payer and kind, the fee paid (amounts of counted transfers from the payer to her, for the offer, refs.subject the deal) times fee_back, exact (nothing is
// rounded); returned is what she has since sent that payer the same way; left the rest, never below zero.
function feeBack(offer, deal, blocks) {
  if (!Basics.isObj(offer) || !Basics.isObj(deal)) throw Bytes.argError('arguments 0 and 1 are blocks');
  const pool = new Check.Pool([...Check.poolOf(blocks).all().filter(x => x.hash !== offer.hash && x.hash !== deal.hash), offer, deal]);
  const out = (settled, releases, to_come, why) => ({ settled, releases, to_come, why });
  const judge = offer.refs.from;
  if (!(offer.type === 'promise' && !offer.refs.answers && !offer.refs.updates && Basics.isStr(judge) && offer.refs.to === undefined && backedIn(offer, judge, pool).backed)) return out(false, [], [], 'the offer is no judge\'s offer: a first promise of hers, backed by her, with the other side open');
  const sch = pool.get(offer.refs.schema);
  if (!(Basics.isObj(sch) && sch.state.kind === 'schema' && sch.state.name === 'judging')) return out(false, [], [], 'the offer is not under the base schema judging');
  const t0 = Basics.termsOf(offer);
  if (!(t0.conciliation === true && Basics.isStr(t0.fee_back) && Check.RX.decimal.test(t0.fee_back))) return out(false, [], [], 'the offer states no conciliation with a fee back');
  const fb = Deals.dec(t0.fee_back);
  if (!Basics.isStr(deal.refs.from) || !Basics.isStr(deal.refs.to)) return out(false, [], [], 'the deal names no two sides');
  const rulings = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'ruling' && o.refs.subject === deal.hash && backedIn(o, judge, pool).backed);
  const releaseOf = side => {
    const rs = pool.all().filter(r => r.type === 'observe' && r.state.kind === 'release' && r.state.status === undefined && r.refs.subject === deal.hash && Identity.counts(r, pool) && Things.speakerOf(r, pool) === side
      && !rulings.some(g => pool.sees(r.hash, g.hash))).map(r => r.hash).sort();
    return rs.length ? rs[0] : null;
  };
  const a = releaseOf(deal.refs.from), b = releaseOf(deal.refs.to);
  if (a === null || b === null) return out(false, [], [], 'the sides have not both released the deal before a ruling of hers');
  const sums = new Map(); // payer + kind -> { payer, kind, paid, back }
  for (const t of pool.all()) {
    if (t.type !== 'transfer' || t.state.status !== undefined || !Check.asList(t.refs.for).includes(offer.hash) || t.refs.subject !== deal.hash || !Identity.counts(t, pool)) continue;
    const m = t.state.amount;
    if (!Deals.isAmount(m)) continue;
    const sp = Things.speakerOf(t, pool);
    let payer, side;
    if (sp === judge && Basics.isStr(t.refs.to) && backedIn(t, judge, pool).backed) { payer = t.refs.to; side = 'back'; } else if (t.refs.to === judge && Basics.isStr(sp)) { payer = sp; side = 'paid'; } else continue;
    const key = payer + '\0' + Bytes.jcs(Deals.kindOf(m));
    if (!sums.has(key)) sums.set(key, { payer, kind: Deals.kindOf(m), paid: Deals.F0, back: Deals.F0, paying: false });
    const e = sums.get(key);
    e[side] = Deals.fadd(e[side], Deals.dec(m.value));
    if (side === 'paid') e.paying = true;
  }
  const lines = [...sums.values()].filter(x => x.paying).sort((x, y) => Basics.cmp(x.payer, y.payer) || Basics.cmp(Bytes.jcs(x.kind), Bytes.jcs(y.kind)));
  // the fee back is the fee paid times fee_back, exact: nothing is rounded
  const toCome = lines.map(x => {
    const fee = Deals.fmul(x.paid, fb);
    const left = Deals.fcmp(fee, x.back) > 0 ? Deals.fsub(fee, x.back) : Deals.F0;
    return { to: x.payer, amount: Deals.amtOut(fee, x.kind), returned: Deals.amtOut(x.back, x.kind), left: Deals.amtOut(left, x.kind) };
  });
  return out(true, [a, b].sort(), toCome, null);
}
// accountOf(who, blocks): where a person says money to them goes (promises.md, Where to pay me). The words counted are the `observe` blocks of kind `account` that `who`
// signed, that speak for no one else and that a node would take; the head is the one no other of those has in its causal past. null for none, for two heads that
// do not see each other, and for a head with no destination (it ends the account).
// an account word states `destinations: [{ destination, by }]`. Of one signer's account words the head is the one no other of hers has in its causal past. A new word replaces the old, and two heads that do not see
// each other name none. The answer is { who, destinations, hash, at } or null.
function accountHeads(who, pool, past) {
  const words = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'account' && b.state.status === undefined && (b.refs.author === who || b.refs.as === who) && (!past || past.has(b.hash)) && Identity.counts(b, pool) && Things.speakerOf(b, pool) === who); // a word `as` a circle counts for it where a row holds for it
  return words.filter(w => !words.some(o => o !== w && pool.sees(o.hash, w.hash)));
}
const destinationsOk = d => Array.isArray(d) && d.length > 0 && d.every(x => Basics.isObj(x) && Basics.isStr(x.destination) && x.destination.trim() !== '' && Basics.isStr(x.by));
function accountOf(who, blocks) {
  if (!Basics.isStr(who)) throw Bytes.argError('who is an id (text)');
  const pool = Check.poolOf(blocks);
  const heads = accountHeads(who, pool, null);
  if (heads.length !== 1) return null;
  const d = heads[0].state.destinations;
  return destinationsOk(d) ? { who, destinations: d.map(x => ({ destination: x.destination, by: x.by })), hash: heads[0].hash, at: Basics.isStr(heads[0].state.at) ? heads[0].state.at : null } : null;
}
// ---- the door's grant operations
// keeps_to(C, A, blocks): { keeps, why }
function keepsToOp(C, A, blocks) {
  if (!Basics.isObj(C) || !Basics.isObj(A)) throw Bytes.argError('arguments 0 and 1 are blocks');
  const pool = Bytes.readWith(Bytes.readWith(blocks, A).all(), C);
  return Grants.keepsTo(pool.get(C.hash) || C, pool.get(A.hash) || A, pool, {});
}
// meter(grant, blocks, block?): { grant, fits, why, line, start, period, draws, left, waiting, ended, comes_back } or { not_shown, lacks }
function meterOp(gb, blocks, at) {
  if (!Basics.isObj(gb)) throw Bytes.argError('argument 0 is a grant');
  const pool = Bytes.readWith(Basics.isObj(at) ? Bytes.readWith(Check.asList(blocks).filter(x => !Basics.isObj(x) || x.hash !== at.hash), at).all() : blocks, gb), g = pool.get(gb.hash);
  if (!g || g.type !== 'grant') return { not_shown: true, lacks: [gb.hash] };
  return Grants.meterRead(g, pool, Basics.isObj(at) ? pool.get(at.hash) || null : null);
}
function lowestOp(gb, blocks) {
  if (!Basics.isObj(gb)) throw Bytes.argError('argument 0 is a grant');
  const pool = Bytes.readWith(blocks, gb), g = pool.get(gb.hash);
  if (!g || g.type !== 'grant') return { not_shown: true, lacks: [gb.hash] };
  return Grants.lowestOffer(g, pool);
}
// ---- the worst case, from her grant and the promises it names alone. Per kind; never added across kinds.
const rangeEnds = v => (Grants.isRangeV(v) ? { lo: 'min' in v ? v.min : null, hi: 'max' in v ? v.max : null } : Grants.isListV(v) ? { lo: v.one_of[0], hi: v.one_of[v.one_of.length - 1] } : { lo: v, hi: v });
const kindKey = k => [k.unit, k.of === null || k.of === undefined ? null : k.of];
const cmpKinds = (a, b) => { const x = kindKey(a), y = kindKey(b); return x[0] !== y[0] ? Basics.cmp(x[0], y[0]) : x[1] === y[1] ? 0 : x[1] === null ? -1 : y[1] === null ? 1 : Basics.cmp(x[1], y[1]); };
function worstOp(gb, blocks) {
  if (!Basics.isObj(gb)) throw Bytes.argError('argument 0 is a grant');
  const pool = Bytes.readWith(blocks, gb), g = pool.get(gb.hash);
  if (!g || g.type !== 'grant') return { not_shown: true, lacks: [gb.hash] };
  const sc = Grants.scopeOf(g), principal = g.refs.author, limit = Grants.limitOf(g);
  // per kind: a fraction, or null for a kind with no top
  const add = (m, a, kind) => { if (a) { const k = Bytes.jcs(a.kind); const e = m.get(k); if (!e) m.set(k, { kind: a.kind, f: a.f }); else if (e.f !== null) e.f = Deals.fadd(e.f, a.f); } else if (kind) m.set(Bytes.jcs(kind), { kind, f: null }); };
  const hand = new Map(), toCome = new Map(), lose = new Map(), on = [], part = [];
  const totalAt = (p, q) => (p === null || p === undefined ? null : Deals.totalOf(p, q === null ? undefined : q));
  const ons = Check.asList(sc.on).map(h => pool.get(h)).filter(A => A && A.type === 'promise');
  // a sell from an instance the grant names counts once with that instance's part, at the largest of them
  const whats = Check.asList(g.refs.what), fromWhat = new Map();
  for (const A of ons) for (const l of Check.linesOf(A.state.terms)) {
    // each line of each promise in `on`
    const sells = A.refs.from === principal, price = l.price, qty = l.quantity;
    const pe = price === undefined ? { lo: null, hi: null } : rangeEnds(price), qe = qty === undefined ? { lo: null, hi: null } : rangeEnds(qty);
    const end = pe.hi !== null ? pe.hi : pe.lo;
    const moneyKind = end === null || end === undefined ? null : Deals.isAmount(end) ? Deals.kindOf(end) : Basics.isObj(end) && Deals.isAmount(end.amount) ? Deals.kindOf(end.amount) : null;
    const inst = sells && Basics.isStr(l.what) && whats.includes(l.what) ? l.what : undefined;
    if (sells && inst !== undefined && Deals.isAmount(qe.hi)) { if (!fromWhat.has(inst)) fromWhat.set(inst, []); fromWhat.get(inst).push({ f: Deals.dec(qe.hi.value), kind: Deals.kindOf(qe.hi) }); add(toCome, totalAt(pe.hi, qe.hi), moneyKind); }
    else if (sells) { add(hand, Deals.isAmount(qe.hi) ? { f: Deals.dec(qe.hi.value), kind: Deals.kindOf(qe.hi) } : null, null); add(toCome, totalAt(pe.hi, qe.hi), moneyKind); }
    else add(hand, totalAt(pe.hi, qe.hi), moneyKind || (limit ? Deals.kindOf(limit) : null));
    on.push({ promise: A.hash, line: l.id === undefined ? null : l.id, side: sells ? 'from' : 'to', price: price === undefined ? null : price, quantity: qty === undefined ? null : qty });
  }
  for (const m of Grants.measuresOf(g, pool).filter(m => Check.asList(g.refs.what).includes(m.of))) {
    if (m.amount) part.push(m.amount);
    const a = m.amount ? { f: Deals.dec(m.amount.value), kind: Deals.kindOf(m.amount) } : null;
    add(lose, a, null);
    const once = new Map();
    for (const x of [...(a ? [a] : []), ...(fromWhat.get(m.of) || [])]) { const k = Bytes.jcs(x.kind), e = once.get(k); if (!e || Deals.fcmp(x.f, e.f) > 0) once.set(k, x); }
    fromWhat.delete(m.of);
    for (const x of once.values()) add(hand, x, null);
  }
  const types = Check.asList(sc.types);
  if (types.includes('observe.paid') || types.includes('observe.received')) for (const [k, v] of toCome) { const e = lose.get(k); if (!e) lose.set(k, { ...v }); else if (e.f !== null) e.f = v.f === null ? null : Deals.fadd(e.f, v.f); }
  if (limit) { const k = Bytes.jcs(Deals.kindOf(limit)), e = hand.get(k); hand.set(k, { kind: Deals.kindOf(limit), f: e && e.f !== null && Deals.fcmp(e.f, Deals.dec(limit.value)) < 0 ? e.f : Deals.dec(limit.value) }); }
  else if (sc.each === undefined) for (const [k, v] of hand) if (!lose.has(k)) v.f = Deals.F0;
  const perKind = m => [...m.values()].filter(v => v.f !== null && Deals.fpos(v.f)).sort((x, y) => cmpKinds(x.kind, y.kind)).map(v => Deals.amtOut(v.f, v.kind));
  const L = Grants.meterLine(g, pool), ks = Identity.clocksOf(sc.clocks);
  const sides = [...new Set([...Check.asList(sc.parties), ...ons.flatMap(A => ['from', 'to'].flatMap(k => Check.asList(A.refs[k]))).filter(x => x !== principal)])].sort();
  return {
    holder: Basics.isStr(g.refs.to) ? g.refs.to : null, types: sc.types === undefined ? [] : sc.types, on, what: g.refs.what === undefined ? null : g.refs.what, part, sides,
    each: sc.each === undefined ? null : sc.each, limit: sc.limit === undefined ? null : sc.limit, every: sc.every === undefined ? null : sc.every, expires: sc.expires === undefined ? null : sc.expires,
    periods: sc.every === undefined ? null : sc.every, at_most: perKind(hand), can_lose: perKind(lose), clocks: sc.clocks === undefined ? null : sc.clocks,
    deadline: sc.deadline === undefined ? null : sc.deadline, fallback: sc.fallback === undefined ? null : sc.fallback, stop: ks ? { names: ks.names, lines: ks.names.length + 1 - ks.needed } : null,
    meter: L === null || L.missing ? null : L.own ? 'own' : L.name, pays: types.includes('transfer'),
  };
}
// scope_reading(scope): the one reading of a grant's state.scope, every default the spec states and nothing else filled in; junk reads as absent
function scopeReading(scope) {
  const none = { types: [], parties: [], on: [], limit: null, each: null, every: null, expires: null, clocks: null, deadline: null, fallback: null, junk: [] };
  if (scope === undefined || scope === null) return none;
  if (!Basics.isObj(scope)) return { ...none, junk: ['scope'] };
  const idList = v => !(Array.isArray(v) && v.every(x => Basics.isStr(x) && Check.RX.id.test(x))) || v.some(x => Check.idProblem(x) === 'unknown_suite');
  const unreadable = {
    types: v => !(Array.isArray(v) && v.every(Basics.isStr)), parties: idList, on: idList,
    limit: v => Check.amountProblem(v) !== null || Deals.decCmp(v.value, '0') < 0, each: v => Check.amountProblem(v) !== null || Deals.decCmp(v.value, '0') < 0,
    every: v => Check.durationProblem(v) !== null || scope.limit === undefined || scope.expires === undefined, expires: v => Check.timeProblem(v) !== null,
    clocks: v => Identity.clocksOf(v) === null, deadline: v => Check.timeProblem(v) !== null, fallback: v => !Basics.P.fallbacks.includes(v) || scope.deadline === undefined,
    ends_on: v => Grants.endsOnProblem(v) !== null,
  };
  const junk = Object.keys(scope).filter(k => !Object.prototype.hasOwnProperty.call(unreadable, k) || unreadable[k](scope[k])).sort();
  const read = k => (k in scope && !junk.includes(k) ? scope[k] : null);
  return { types: read('types') || [], parties: read('parties') || [], on: read('on') || [], limit: read('limit'), each: read('each'), every: read('every'), expires: read('expires'), clocks: read('clocks'), deadline: read('deadline'), fallback: read('fallback'), junk };
}
// residency (profiles/residency.md): a receiver that states a non-empty holds_in refuses a block whose stays_in does not list every entry of it;
// one that states none refuses nothing, and a block with no stays_in asks nothing. Labels are compared exactly; none is expanded.
const residencyRefusals = (block, holdsIn) => {
  const labels = v => (Array.isArray(v) ? v : Basics.isStr(v) && v !== '' ? [v] : []).filter(Basics.isStr);
  const holds = Array.isArray(holdsIn) ? holdsIn.filter(Basics.isStr) : [], stays = labels(block.state.stays_in);
  if (!holds.length || !stays.length) return [];
  return holds.every(r => stays.includes(r)) ? [] : [{ code: 'residency', detail: 'the node holds outside stays_in' }];
};
// A model's reading is the autonomous system's claim; it becomes the person's only when she puts that fact to someone else in her own step (things.md, Truth)
const readingIsPersonsClaim = (reading, person, blocks) => reading.state.kind === 'reading' && Check.poolOf(blocks).all().some(b => b.refs.author === person && Check.asList(b.refs.derives_from).includes(reading.hash) && [...Check.asList(b.refs.to), ...Check.asList(b.refs.to_owner)].some(x => x !== person));
Object.assign(module.exports, { namesOf, consentFold, isStranger, admissionRefusals, speaksFor, backed, backedAll, backedIn, gives, givesIn, toComeBack, measureOf, listingCheck, checkReads, dealSides, clearingApplied, ruledFor, rulingReleases, rulingHonoured, feeBack, accountHeads, destinationsOk, accountOf, keepsToOp, meterOp, lowestOp, rangeEnds, worstOp, scopeReading, residencyRefusals, readingIsPersonsClaim });
