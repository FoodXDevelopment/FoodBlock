// Adds to spec/vectors.json the cases of `repeat_occurrences` (promises.md, Terms: repeat, zone): the occurrences of a standing promise's
// calendar repeat between two instants, read in its zone by the IANA database release 2026e. `node test/make-vectors-recur.cjs`, after
// `node scripts/build-wasm.cjs`. Idempotent. Every expectation below is written by hand from the spec text and RFC 5545 (and was checked
// against Python's dateutil and zoneinfo); the Rust core must give it, and so must the oracle (spec/oracle), which reads the rule a day at a time.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { door, call } = kit

const promise = (when, repeat, zone) => ({ type: 'promise', state: { when, terms: { repeat, ...(zone ? { zone } : {}) } }, refs: {} })
const occ = (name, when, repeat, zone, from, to, expect) => door(`recur: ${name}`, 'repeat_occurrences', [promise(when, repeat, zone), from, to], { expect, exact: true })
const refused = (name, p, from = '2026-01-01T00:00:00.000Z', to = '2026-02-01T00:00:00.000Z') => {
  const args = JSON.parse(JSON.stringify([p, from, to]))
  assert.throws(() => call('repeat_occurrences', ...args), (e) => e.kind === 'argument', name)
  V.door = V.door.filter((c) => c.name !== `recur: ${name}`)
  V.door.push({ name: `recur: ${name}`, op: 'repeat_occurrences', args, error: { kind: 'argument' } })
  kit.made.add(`recur: ${name}`)
}

// Tuesday 09:00 in London: the clocks go forward on Sunday 29 March 2026 and back on Sunday 25 October 2026. The wall clock keeps, so the UTC time moves.
occ('a weekly London repeat keeps 09:00 on the wall through the clocks going forward', '2026-03-17T09:00:00.000Z', 'FREQ=WEEKLY;BYDAY=TU', 'Europe/London', '2026-03-17T00:00:00.000Z', '2026-04-08T00:00:00.000Z',
  ['2026-03-17T09:00:00.000Z', '2026-03-24T09:00:00.000Z', '2026-03-31T08:00:00.000Z', '2026-04-07T08:00:00.000Z'])
occ('and through the clocks going back', '2026-10-20T08:00:00.000Z', 'FREQ=WEEKLY;BYDAY=TU', 'Europe/London', '2026-10-20T00:00:00.000Z', '2026-11-10T00:00:00.000Z',
  ['2026-10-20T08:00:00.000Z', '2026-10-27T09:00:00.000Z', '2026-11-03T09:00:00.000Z'])
// 01:30 does not exist in London on 29 March 2026 (01:00 becomes 02:00): it falls by the offset before the jump, which is 01:30Z; and it happens twice on 25 October: the first
occ('a wall time the clocks skip falls by the offset before the skip', '2026-03-27T01:30:00.000Z', 'FREQ=DAILY', 'Europe/London', '2026-03-27T00:00:00.000Z', '2026-03-31T00:00:00.000Z',
  ['2026-03-27T01:30:00.000Z', '2026-03-28T01:30:00.000Z', '2026-03-29T01:30:00.000Z', '2026-03-30T00:30:00.000Z'])
occ('a wall time the clocks repeat is its first', '2026-10-24T00:30:00.000Z', 'FREQ=DAILY', 'Europe/London', '2026-10-24T00:00:00.000Z', '2026-10-28T00:00:00.000Z',
  ['2026-10-24T00:30:00.000Z', '2026-10-25T00:30:00.000Z', '2026-10-26T01:30:00.000Z', '2026-10-27T01:30:00.000Z'])
// Nairobi keeps UTC+3 all year: 23:30 on a Monday there is 20:30Z the same Monday, and 01:00 on a Tuesday there is 22:00Z on the Monday
occ('Nairobi keeps +03:00 all year: Monday and Friday 23:30 there', '2026-06-01T20:30:00.000Z', 'FREQ=WEEKLY;BYDAY=MO,FR', 'Africa/Nairobi', '2026-03-01T00:00:00.000Z', '2026-06-16T00:00:00.000Z',
  ['2026-06-01T20:30:00.000Z', '2026-06-05T20:30:00.000Z', '2026-06-08T20:30:00.000Z', '2026-06-12T20:30:00.000Z', '2026-06-15T20:30:00.000Z'])
occ('the day is the zone\'s, not UTC\'s: Tuesday 01:00 in Nairobi is Monday 22:00Z', '2026-06-01T22:00:00.000Z', 'FREQ=WEEKLY;BYDAY=TU', 'Africa/Nairobi', '2026-06-01T00:00:00.000Z', '2026-06-23T00:00:00.000Z',
  ['2026-06-01T22:00:00.000Z', '2026-06-08T22:00:00.000Z', '2026-06-15T22:00:00.000Z', '2026-06-22T22:00:00.000Z'])
// the window: from is in, to is out, and a window long after the start skips to it (without a COUNT)
occ('from is inside the window and to is outside it', '2026-03-17T09:00:00.000Z', 'FREQ=WEEKLY;BYDAY=TU', 'Europe/London', '2026-03-24T09:00:00.000Z', '2026-03-31T08:00:00.000Z', ['2026-03-24T09:00:00.000Z'])
occ('a window long after the start', '2026-03-17T09:00:00.000Z', 'FREQ=WEEKLY;BYDAY=TU', 'Europe/London', '2031-01-01T00:00:00.000Z', '2031-01-15T00:00:00.000Z', ['2031-01-07T09:00:00.000Z', '2031-01-14T09:00:00.000Z'])
occ('a window before the start has none', '2026-03-17T09:00:00.000Z', 'FREQ=WEEKLY;BYDAY=TU', 'Europe/London', '2026-01-01T00:00:00.000Z', '2026-03-17T09:00:00.000Z', [])
occ('a window of nothing has none', '2026-03-17T09:00:00.000Z', 'FREQ=DAILY', 'UTC', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', [])
// the markets' weeks, and a sensor
occ('a market on a 4-day week: every fourth day', '2026-11-01T06:00:00.000Z', 'FREQ=DAILY;INTERVAL=4', 'Africa/Nairobi', '2026-11-01T00:00:00.000Z', '2026-11-20T00:00:00.000Z',
  ['2026-11-01T06:00:00.000Z', '2026-11-05T06:00:00.000Z', '2026-11-09T06:00:00.000Z', '2026-11-13T06:00:00.000Z', '2026-11-17T06:00:00.000Z'])
occ('a sensor\'s heartbeat every five minutes', '2026-11-05T00:00:00.000Z', 'FREQ=MINUTELY;INTERVAL=5', 'UTC', '2026-11-05T01:00:00.000Z', '2026-11-05T01:20:00.000Z',
  ['2026-11-05T01:00:00.000Z', '2026-11-05T01:05:00.000Z', '2026-11-05T01:10:00.000Z', '2026-11-05T01:15:00.000Z'])
occ('a window far from a minutely start skips to it', '2026-11-05T00:00:00.000Z', 'FREQ=MINUTELY;INTERVAL=5', 'UTC', '2027-11-05T01:00:00.000Z', '2027-11-05T01:11:00.000Z',
  ['2027-11-05T01:00:00.000Z', '2027-11-05T01:05:00.000Z', '2027-11-05T01:10:00.000Z'])
occ('hourly, only on Monday and Thursday', '2026-11-05T00:00:00.000Z', 'FREQ=HOURLY;INTERVAL=7;BYDAY=MO,TH', 'UTC', '2026-11-05T01:00:00.000Z', '2026-11-12T02:00:00.000Z',
  ['2026-11-05T07:00:00.000Z', '2026-11-05T14:00:00.000Z', '2026-11-05T21:00:00.000Z', '2026-11-09T02:00:00.000Z', '2026-11-09T09:00:00.000Z', '2026-11-09T16:00:00.000Z', '2026-11-09T23:00:00.000Z', '2026-11-12T00:00:00.000Z'])
// months and years
occ('the last Friday of every second month', '2026-01-30T10:00:00.000Z', 'FREQ=MONTHLY;BYDAY=-1FR;INTERVAL=2', 'UTC', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
  ['2026-01-30T10:00:00.000Z', '2026-03-27T10:00:00.000Z', '2026-05-29T10:00:00.000Z', '2026-07-31T10:00:00.000Z', '2026-09-25T10:00:00.000Z', '2026-11-27T10:00:00.000Z'])
occ('a monthly repeat from the 31st skips the months with no 31st', '2026-01-31T10:00:00.000Z', 'FREQ=MONTHLY', 'America/New_York', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
  ['2026-01-31T10:00:00.000Z', '2026-03-31T09:00:00.000Z', '2026-05-31T09:00:00.000Z', '2026-07-31T09:00:00.000Z', '2026-08-31T09:00:00.000Z', '2026-10-31T09:00:00.000Z', '2026-12-31T10:00:00.000Z'])
occ('the last weekday of the month (BYSETPOS)', '2026-01-05T08:00:00.000Z', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'Europe/London', '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  ['2026-01-30T08:00:00.000Z', '2026-02-27T08:00:00.000Z', '2026-03-31T07:00:00.000Z', '2026-04-30T07:00:00.000Z', '2026-05-29T07:00:00.000Z'])
occ('29 February comes only in leap years', '2024-02-29T10:00:00.000Z', 'FREQ=YEARLY', 'Europe/Paris', '2024-01-01T00:00:00.000Z', '2037-01-01T00:00:00.000Z',
  ['2024-02-29T10:00:00.000Z', '2028-02-29T10:00:00.000Z', '2032-02-29T10:00:00.000Z', '2036-02-29T10:00:00.000Z'])
occ('the 20th Monday of the year', '2026-01-01T09:00:00.000Z', 'FREQ=YEARLY;BYDAY=20MO', 'America/Los_Angeles', '2026-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z',
  ['2026-05-18T08:00:00.000Z', '2027-05-17T08:00:00.000Z'])
occ('the days of the year counted from either end', '2026-01-01T09:00:00.000Z', 'FREQ=YEARLY;BYYEARDAY=1,100,-1', 'Pacific/Auckland', '2026-01-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z',
  ['2026-01-01T09:00:00.000Z', '2026-04-10T10:00:00.000Z', '2026-12-31T09:00:00.000Z', '2027-01-01T09:00:00.000Z', '2027-04-10T10:00:00.000Z'])
// COUNT counts from the start, even before the window; UNTIL ends it
occ('COUNT counts from the start of the promise, not of the window', '2026-01-01T09:00:00.000Z', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,TU;WKST=SU;COUNT=9', 'Asia/Kolkata', '2026-02-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z',
  ['2026-02-08T09:00:00.000Z', '2026-02-10T09:00:00.000Z', '2026-02-22T09:00:00.000Z', '2026-02-24T09:00:00.000Z', '2026-03-08T09:00:00.000Z'])
occ('UNTIL in UTC ends it, itself included', '2026-01-01T09:00:00.000Z', 'FREQ=DAILY;UNTIL=20260103T090000Z', 'Europe/London', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
  ['2026-01-01T09:00:00.000Z', '2026-01-02T09:00:00.000Z', '2026-01-03T09:00:00.000Z'])
occ('UNTIL as a date ends it at the end of that day in the zone', '2026-06-01T20:30:00.000Z', 'FREQ=DAILY;UNTIL=20260603', 'Africa/Nairobi', '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z',
  ['2026-06-01T20:30:00.000Z', '2026-06-02T20:30:00.000Z', '2026-06-03T20:30:00.000Z'])
occ('RSCALE=GREGORIAN is the Gregorian calendar', '2026-03-01T02:30:00.000Z', 'RSCALE=GREGORIAN;FREQ=DAILY', 'UTC', '2026-03-05T00:00:00.000Z', '2026-03-07T00:00:00.000Z', ['2026-03-05T02:30:00.000Z', '2026-03-06T02:30:00.000Z'])
// what is refused, never guessed
const base = promise('2026-01-01T09:00:00.000Z', 'FREQ=DAILY', 'Europe/London')
refused('a repeat that follows an event has no calendar', { ...base, state: { when: '2026-01-01T09:00:00.000Z', terms: { repeat: { after: 'delivered', by: ['a'.repeat(64)], wait: 'P1D' }, zone: 'Europe/London' } } })
refused('a calendar repeat with no zone is not read', promise('2026-01-01T09:00:00.000Z', 'FREQ=DAILY'))
refused('a zone that is not in the database is not read', promise('2026-01-01T09:00:00.000Z', 'FREQ=DAILY', 'Mars/Olympus_Mons'))
refused('another calendar (RSCALE=HEBREW) is not read', promise('2026-01-01T09:00:00.000Z', 'RSCALE=HEBREW;FREQ=YEARLY', 'UTC'))
refused('a part the reader does not know (BYWEEKNO) is not read', promise('2026-01-01T09:00:00.000Z', 'FREQ=YEARLY;BYWEEKNO=20', 'UTC'))
refused('a repeat with no FREQ is not read', promise('2026-01-01T09:00:00.000Z', 'INTERVAL=2', 'UTC'))
refused('COUNT and UNTIL together are not read', promise('2026-01-01T09:00:00.000Z', 'FREQ=DAILY;COUNT=3;UNTIL=20260201', 'UTC'))
refused('a promise that starts after an event has no start to count from', { ...base, state: { when: { after: 'delivered', wait: 'P1D' }, terms: { repeat: 'FREQ=DAILY', zone: 'UTC' } } })

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
