// `elapsed`. (1) Mo, a visitor, accepts the café's door rule "no phones in the prep room until you leave" (`until` 18:00). Expect `promise_view` at 19:00: `elapsed`; `promise_stage`: `accepted`.
const L = require('./lib.cjs'); const { fb, World, P, T, A, check, done, stage, view, yes, day } = L;
{
  const w = new World(), cafe = P(w, 'cafe'), mo = P(w, 'mo');
  const rule = T(cafe.write('promise', { what: 'no phones in the prep room until you leave', terms: { until: day(0, 18) } }, { from: mo.id, to: cafe.id }), 'RULE');
  yes(mo, rule);
  check('elapsed', 'stage accepted', stage(w, rule).stage, 'accepted');
  check('elapsed', 'view at 19:00: elapsed', view(w, rule, day(0, 19)).stage, 'elapsed');
  check('elapsed', 'view at 17:00: accepted', view(w, rule, day(0, 17)).stage, 'accepted');
}
done();
