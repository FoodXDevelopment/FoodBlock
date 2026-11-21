// G3, overlap (D6, T2-3). Sam S1 want: sukuma, { max: 60 KES per bunch }, grant to his agent SA. Mama M1 offer: 20 bunches, { min: 45 per bunch }, grant to Soko GS on [M1].
// SA1 offers Mama 20 at 50: keeps S1. Soko's yes Y1 answers SA1: keeps to M1, binds Mama. SA2 at 40: Soko's yes not_kept; Mama's own yes binds her. Maria's till, floor £3; Leila's counter at £2.50; the till's yes: not_kept.
// (Sam's grant states a limit and SA1 states its draw, because the grant of a payer must: a missing limit lets no block draw above zero.)
const L = require('./lib.cjs'); const { fb, World, P, T, check, done, A, kindOf, instance, promise, accepts, GBP, per, grant, whyOf, ok, backedBy } = L;
const w = new World(); const sam = P(w, 'sam'), mama = P(w, 'mama'), soko = P(w, 'soko'), sa = P(w, 'sa'), maria = P(w, 'maria'), leila = P(w, 'leila'), till = P(w, 'till'), otieno = P(w, 'otieno');
const K = kindOf(mama, 'sukuma'), Lx = instance(mama, K, { pack: A('20', 'bunch') });
const KES = v => A(String(v), 'KES'), pk = v => ({ amount: KES(v), per: A('1', 'bunch') });
const S1 = T(promise(sam, { to: sam.id, what: K.hash }, { quantity: A('20', 'bunch'), price: { max: pk(60) } }), 'S1');
const GSA = T(grant(sam, sa, { types: ['promise'], on: [S1.hash], parties: [mama.id], limit: KES(2400) }, { meter: sa.id }), 'GSA');
const M1 = T(promise(mama, { from: mama.id, what: Lx.hash }, { quantity: A('20', 'bunch'), price: { min: pk(45) } }), 'M1');
const GS = T(grant(mama, soko, { types: ['promise'], on: [M1.hash], parties: [sam.id] }, { meter: soko.id }), 'GS');
const offerAt = (v, tag) => T(sa.write('promise', { terms: { quantity: A('20', 'bunch'), price: pk(v) }, draws: { grant: GSA.hash, amount: KES(20 * v) } }, { from: mama.id, to: sam.id, what: Lx.hash, under: GSA.hash }), tag);
const SA1 = offerAt(50, 'SA1'), SA2 = offerAt(40, 'SA2');
const yes = (o, tag) => T(soko.write('promise', { status: 'accepted' }, { answers: o.hash, for: o.hash, under: GS.hash }), tag);
const Y1 = yes(SA1, 'Y1'), Y2 = yes(SA2, 'Y2');
check('G3', 'SA1 at 50 keeps to S1 and speaks for Sam', [whyOf(SA1, w), fb.door('speaks_for', SA1, w.blocks) === sam.id], [null, true]);
check('G3', 'Soko\'s yes Y1 answers SA1 (50 is in the overlap): speaks for Mama', [whyOf(Y1, w), fb.door('speaks_for', Y1, w.blocks) === mama.id], [null, true]);
check('G3', 'SA2 at 40 keeps to Sam\'s range, but SA1 already holds his 20 bunches: past on his agent\'s line', whyOf(SA2, w), { code: 'past', why: null });
check('G3', 'Soko\'s yes Y2 to SA2 at 40 (below Mama\'s floor of 45): the code and the path', whyOf(Y2, w), { code: 'not_kept', why: 'terms.price' });
const own = mama.write('promise', { status: 'accepted' }, { answers: SA2.hash, for: SA2.hash });
check('G3', 'Mama\'s own yes to SA2 binds her (her own word)', backedBy(own, mama, w).backed, true);
// Maria's till
const loaf = kindOf(maria, 'loaf'), li = instance(maria, loaf, { pack: A('10', 'loaf') });
const ML = T(promise(maria, { from: maria.id, what: li.hash }, { quantity: A('10', 'loaf'), price: { min: per(3, 'GBP', 'loaf') } }), 'ML');
const GT = T(grant(maria, till, { types: ['promise'], on: [ML.hash], parties: [leila.id] }, { meter: till.id }), 'GT');
const cnt = T(leila.write('promise', { terms: { quantity: A('10', 'loaf'), price: per(2.5, 'GBP', 'loaf') } }, { from: maria.id, to: leila.id, what: li.hash, answers: ML.hash, for: ML.hash }), 'counter');
const ty = T(till.write('promise', { status: 'accepted' }, { answers: cnt.hash, for: ML.hash, under: GT.hash }), 'till-yes');
check('G3', 'Maria\'s till (floor £3), Leila\'s counter at £2.50, the till\'s yes: the code', whyOf(ty, w), { code: 'not_kept', why: 'terms.price' });
const cnt3 = T(leila.write('promise', { terms: { quantity: A('10', 'loaf'), price: per(3, 'GBP', 'loaf') } }, { from: maria.id, to: leila.id, what: li.hash, answers: ML.hash, for: ML.hash }), 'counter3');
check('G3', 'control: a counter at the floor of £3 is kept', whyOf(T(till.write('promise', { status: 'accepted' }, { answers: cnt3.hash, for: ML.hash, under: GT.hash }), 'ty3'), w), null);
done();
