'use strict';
// scope_reading on scopes that mix fields the protocol reads with ones it does not (a field of the wrong shape, an unknown field, a list
// where a word is wanted, a date that is no date): each field the scope states is either read or named as junk, the same in both engines.
// A grant's end is `expires`; an amount is `{ value, unit }`.
const SCOPES = [
  {"types":["observe.note","promise"],"parties":["5385dddd2c68bb4121baacb8549371a72b9cb5f72c4dd25b4342ad1ad0073b83","1d55d1b23d6de89ff1cfab7d255dd5acb597752c6588eaa122491fbba95333cc","3d7c033f499a27e8c630618485b76dd2e73635c52990611cd60791fa18c50c70","f458c560c0520294727380f6d31a53bcda60983d417f9f475bc7fb39e3d900cc"],"limit":{"value":"50","unit":"GBP"},"every":"P7D","expires":"2026-12-31T00:00:00.000Z"},
  {"types":["observe.note","promise","transfer"],"parties":["5385dddd2c68bb4121baacb8549371a72b9cb5f72c4dd25b4342ad1ad0073b83","1d55d1b23d6de89ff1cfab7d255dd5acb597752c6588eaa122491fbba95333cc","3d7c033f499a27e8c630618485b76dd2e73635c52990611cd60791fa18c50c70"],"limit":{"value":"90","unit":"GBP"},"every":"P7D","expires":"2026-12-31T00:00:00.000Z"},
  {"types":["promise",3],"parties":["f458c560c0520294727380f6d31a53bcda60983d417f9f475bc7fb39e3d900cc"],"limit":{"value":"50","unit":"GBP"},"colour":null},
  {"limit":{"value":"0.05","unit":"gbp"},"notice":null,"expires":"tomorrow","condition":"when ready"},
  {"limit":{"value":"0","unit":"EUR"},"notice":"PT48H"},
  {"types":["observe.note","promise","transfer"],"parties":["48fe1c784bf69dbceb5fc03a92d0adcfe3b57637642ad27adb2cc464d311c4ee"],"limit":{"value":"90","unit":"GBP"},"every":"P7D","expires":"2027-06-01T00:00:00.000Z"},
  {"types":["promise"],"parties":["80c8a9c1abfbed6e3d2392504783430e42c0934ff0ed7daa353421df8739dfd4"],"limit":{"value":"0","unit":"EUR"},"each":null,"notice":"two days","colour":null},
  {"types":["observe.note","promise"],"each":{"value":"9","unit":"GBP"},"colour":"red"},
  {"types":["promise"],"limit":{"value":"0.05","unit":"gbp"},"every":"P7D"},
  {"limit":{"value":"50","unit":"GBP"},"each":7},
  {"limit":{"value":"0.05","unit":"gbp"}},
  {"limit":{"value":"0.015","unit":"GBP"},"each":{"value":"9","unit":"GBP"},"notice":"two days"},
  {"types":{},"limit":{"value":"0","unit":"EUR"},"each":{"value":"-0.5","unit":"kg"},"colour":null},
  {"types":["observe.note","promise","transfer"],"parties":["a073aebcb0860afe62f31503eaca39a938c2d64f6a7788cb87c18095f5dfbf8e","090bb5cc35b4da265a9b6391ee4906e3ab10c83512d489103198cd16178bad11"],"limit":{"value":"50","unit":"GBP"},"every":"P7D","expires":"2026-12-31T00:00:00.000Z"},
  {"limit":{"value":"0.05","unit":"gbp"},"each":{"value":"5","unit":"kg"},"notice":7,"expires":null,"condition":3},
  {"each":{"value":"9","unit":"GBP"},"every":"P1DT","notice":"PT","colour":5},
  {"each":{"value":"9","unit":"GBP"},"notice":null,"condition":3},
  {"parties":["4e499777ad1ab46fb3b23cef540f39256c1d879ae7d0ba43d113aa14a4900656"],"limit":{"value":"0.015","unit":"GBP"},"each":{"value":"9","unit":"GBP"},"every":"P1DT","colour":"red"},
  {"limit":{"value":"50","unit":"GBP"},"each":7,"expires":"2027-12-31","colour":5},
  {"limit":{"value":"50","unit":"GBP"},"every":"P1M","condition":["a","b"]},
  {"limit":{"value":"0.05","unit":"gbp"},"notice":"two days","condition":{"settled":"x"}},
  {"each":{"value":"9","unit":"GBP"},"notice":7,"expires":"tomorrow","condition":"when ready","colour":"red"},
  {"parties":["16f6990c8703bece98aab92e08a77a8da9e9a538f5ea059319af042e62f28aac","x"],"limit":{"value":"0","unit":"EUR"},"every":"monthly","condition":{"settled":"x"},"colour":null},
  {"types":["observe.note","promise"],"parties":["4099e892f1f56d283b0a6b2e494f14cb3680bcc58299e2e8d5d5e609963d9cee","sm3:adcc919c1cdc086bff45964dd6d5cf666474a2ae5f29ff78d97b34d31f1487f4","ed659d58c368ffb9e430deadb948543a0f4f25b8fcbda8515ff6a3ca3c92a43c","e61eb95a11811f5674344b803f5611129d722f09132ddf47333d02ad91832f90"],"limit":{"value":"50","unit":"GBP"},"every":"P7D","expires":"2026-12-31T00:00:00.000Z"},
  {"types":["promise"],"limit":{"value":"0.05","unit":"gbp"},"each":{"value":"9","unit":"GBP"},"condition":3},
  {"limit":{"value":"0","unit":"EUR"},"notice":"two days"},
  {"limit":{"value":"1.5","unit":"kg"},"each":{"value":"9","unit":"GBP"},"expires":"2027-02-30T00:00:00.000Z","condition":{"settled":"x"}},
  {"limit":{"value":"0","unit":"EUR"},"condition":["a","b"],"colour":"red"},
  {"each":{"value":"9","unit":"GBP"},"expires":5},
  {"types":"promise","each":{"value":"9","unit":"GBP"}},
  {"types":["observe.note","promise"],"limit":{"value":"50","unit":"GBP"},"each":null,"every":"P1Y2M3W4DT5H6M7S","expires":"2027-12-31T24:00:00.000Z","colour":"red"},
  {"types":["observe.note","promise"],"limit":{"value":"50","unit":"GBP"}},
  {"parties":"nobody","limit":{"value":"0","unit":"EUR"},"every":"P","notice":null,"expires":"2026-12-31T00:00:00.000Z","colour":null},
  {"types":["promise",3],"limit":{"value":"50","unit":"GBP"},"notice":null,"colour":5},
  {"limit":{"value":"50","unit":"GBP"},"every":"PT","condition":null,"colour":"red"},
  {"limit":{"value":"50","unit":"GBP"},"every":"P1W2D3","notice":null,"expires":"2027-12-31T00:00:00.000Z","condition":"when ready"},
  {"limit":{"value":"0.05","unit":"gbp"},"every":"P7D","notice":"PT48H","colour":"red"},
  {"types":["observe.note","promise"],"parties":["f5eda940ce80a276e6cc2f0bc3fa9958ef6e31d56310b83ce0b430757626e485","30587dcc63f6b439131d59d48ad7ca174fe3f379ce9ce6b51f0212afe243f6db","e20080b626317124843fefbd36891cb61ab615183c64883a572a351e412e0783","sm3:aceddfdde92b604618ff2c93781e25f667c0de45aa4e166f1bc83b4558409175"],"limit":{"value":"50","unit":"GBP"},"every":"P7D","expires":"2026-12-31T00:00:00.000Z"},
  {"limit":{"value":"0.05","unit":"gbp"},"notice":"two days","expires":"2027-12-31","condition":null},
  {"types":{},"limit":{"value":"0.05","unit":"gbp"},"each":{"value":"-0.5","unit":"kg"},"notice":7,"expires":"2027-12-31T00:00:00.000Z"},
  {"parties":["f5eda940ce80a276e6cc2f0bc3fa9958ef6e31d56310b83ce0b430757626e485"],"limit":{"value":"0","unit":"EUR"},"each":{"value":"9","unit":"GBP"}},
  {"types":["promise"],"parties":["f5eda940ce80a276e6cc2f0bc3fa9958ef6e31d56310b83ce0b430757626e485"],"limit":{"value":"50","unit":"GBP"},"every":"P1DT","notice":"two days","expires":"2027-12-31T00:00:00.000Z","colour":"red"},
  {"parties":null,"limit":{"value":"0.05","unit":"gbp"},"each":{"value":"-0.5","unit":"kg"},"condition":{}},
  {"types":"promise","limit":{"value":"-0.01","unit":"GBP"},"each":{"value":"9","unit":"GBP"},"expires":"2027-12-31T00:00:00.000Z"},
  {"types":null,"limit":null,"each":{"value":"9","unit":"GBP"},"every":"","expires":"2027-12-31T00:00:00.000Z","colour":null},
  {"each":{"value":"9","unit":"GBP"},"colour":"red"},
];

module.exports = [
  { name: 'scope_reading: scopes mixing read fields and junk', row: 1, source: 'random worlds, reduced to the scope each asked', build(L) {
    const w = { name: 'scope readings', blocks: [] };
    SCOPES.forEach((scope, i) => L.ask(w, `scope ${i + 1}`, 'scope_reading', [scope]));
  } },
];
