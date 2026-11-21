// Adds to spec/vectors.json the calendar forms of a repeat (promises.md, Terms: repeat, The calendar forms): every weekday, every Friday, every
// month on day N, the nth weekday of the month, and the week start, read in a zone, over month ends, the leap day and the year boundary.
// `node test/make-vectors-calendar.cjs`, after `node scripts/build-wasm.cjs`. Idempotent. Each expectation was written out from the spec text
// and RFC 5545 and cross-checked with Python's dateutil and zoneinfo (the dates are real calendar dates, 2026 to 2028); the Rust core must
// give it and so must the oracle (spec/oracle), which reads the rule a day at a time. Cases are door cases of `repeat_occurrences`: every SDK's vectors test runs the `door` section.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { door, call } = kit

const promise = (when, repeat, zone) => ({ type: 'promise', state: { when, terms: { repeat, ...(zone ? { zone } : {}) } }, refs: {} })
const occ = (name, when, repeat, zone, from, to, expect) => door(`calendar: ${name}`, 'repeat_occurrences', [promise(when, repeat, zone), from, to], { expect, exact: true })
const refused = (name, repeat) => {
  const args = JSON.parse(JSON.stringify([promise('2026-01-01T09:00:00.000Z', repeat, 'UTC'), '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z']))
  assert.throws(() => call('repeat_occurrences', ...args), (e) => e.kind === 'argument', name)
  V.door = V.door.filter((c) => c.name !== `calendar: ${name}`)
  V.door.push({ name: `calendar: ${name}`, op: 'repeat_occurrences', args, error: { kind: 'argument' } })
  kit.made.add(`calendar: ${name}`)
}

occ('every weekday runs over the year boundary: Monday 28 December to Monday 11 January', '2026-12-28T09:00:00.000Z', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'UTC', '2026-12-28T00:00:00.000Z', '2027-01-12T00:00:00.000Z',
  ['2026-12-28T09:00:00.000Z', '2026-12-29T09:00:00.000Z', '2026-12-30T09:00:00.000Z', '2026-12-31T09:00:00.000Z', '2027-01-01T09:00:00.000Z', '2027-01-04T09:00:00.000Z', '2027-01-05T09:00:00.000Z', '2027-01-06T09:00:00.000Z', '2027-01-07T09:00:00.000Z', '2027-01-08T09:00:00.000Z', '2027-01-11T09:00:00.000Z'])
occ('every Friday through February of a leap year (the 29th is a Tuesday)', '2028-02-04T09:00:00.000Z', 'FREQ=WEEKLY;BYDAY=FR', 'UTC', '2028-02-01T00:00:00.000Z', '2028-03-11T00:00:00.000Z',
  ['2028-02-04T09:00:00.000Z', '2028-02-11T09:00:00.000Z', '2028-02-18T09:00:00.000Z', '2028-02-25T09:00:00.000Z', '2028-03-03T09:00:00.000Z', '2028-03-10T09:00:00.000Z'])
occ('every Friday 08:00 in Auckland is Thursday 19:00Z', '2026-11-05T19:00:00.000Z', 'FREQ=WEEKLY;BYDAY=FR', 'Pacific/Auckland', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z',
  ['2026-11-05T19:00:00.000Z', '2026-11-12T19:00:00.000Z', '2026-11-19T19:00:00.000Z', '2026-11-26T19:00:00.000Z'])
occ('every Friday 23:30 in Los Angeles is Saturday in UTC, and moves an hour when the clocks go back', '2026-10-24T06:30:00.000Z', 'FREQ=WEEKLY;BYDAY=FR', 'America/Los_Angeles', '2026-10-24T00:00:00.000Z', '2026-11-16T00:00:00.000Z',
  ['2026-10-24T06:30:00.000Z', '2026-10-31T06:30:00.000Z', '2026-11-07T07:30:00.000Z', '2026-11-14T07:30:00.000Z'])
occ('every month on day 31: only the months that have one, into the next year', '2026-01-01T12:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=31', 'UTC', '2026-01-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z',
  ['2026-01-31T12:00:00.000Z', '2026-03-31T12:00:00.000Z', '2026-05-31T12:00:00.000Z', '2026-07-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z', '2026-10-31T12:00:00.000Z', '2026-12-31T12:00:00.000Z', '2027-01-31T12:00:00.000Z'])
occ('every month on day 30: February has none', '2026-01-01T12:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=30', 'UTC', '2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z',
  ['2026-01-30T12:00:00.000Z', '2026-03-30T12:00:00.000Z', '2026-04-30T12:00:00.000Z'])
occ('every month on day 29: February has one only in the leap year 2028', '2027-01-01T12:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=29', 'UTC', '2027-01-01T00:00:00.000Z', '2028-04-01T00:00:00.000Z',
  ['2027-01-29T12:00:00.000Z', '2027-03-29T12:00:00.000Z', '2027-04-29T12:00:00.000Z', '2027-05-29T12:00:00.000Z', '2027-06-29T12:00:00.000Z', '2027-07-29T12:00:00.000Z', '2027-08-29T12:00:00.000Z', '2027-09-29T12:00:00.000Z', '2027-10-29T12:00:00.000Z', '2027-11-29T12:00:00.000Z', '2027-12-29T12:00:00.000Z', '2028-01-29T12:00:00.000Z', '2028-02-29T12:00:00.000Z', '2028-03-29T12:00:00.000Z'])
occ('every month on its last day (-1): 29 February 2028 included', '2027-11-01T12:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=-1', 'UTC', '2027-11-01T00:00:00.000Z', '2028-06-01T00:00:00.000Z',
  ['2027-11-30T12:00:00.000Z', '2027-12-31T12:00:00.000Z', '2028-01-31T12:00:00.000Z', '2028-02-29T12:00:00.000Z', '2028-03-31T12:00:00.000Z', '2028-04-30T12:00:00.000Z', '2028-05-31T12:00:00.000Z'])
occ('every month on day 1, from a start in mid-month: the start itself is no occurrence', '2026-11-15T07:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=1', 'Europe/London', '2026-11-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z',
  ['2026-12-01T07:00:00.000Z', '2027-01-01T07:00:00.000Z', '2027-02-01T07:00:00.000Z'])
occ('every month on day 15, from the 15th: the start is the first occurrence', '2026-11-15T07:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=15', 'Europe/London', '2026-11-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z',
  ['2026-11-15T07:00:00.000Z', '2026-12-15T07:00:00.000Z', '2027-01-15T07:00:00.000Z'])
occ('every month on day 28 at 17:30 New York: the wall clock keeps through the clocks changing', '2026-02-28T22:30:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=28', 'America/New_York', '2026-02-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z',
  ['2026-02-28T22:30:00.000Z', '2026-03-28T21:30:00.000Z', '2026-04-28T21:30:00.000Z', '2026-05-28T21:30:00.000Z', '2026-06-28T21:30:00.000Z', '2026-07-28T21:30:00.000Z', '2026-08-28T21:30:00.000Z', '2026-09-28T21:30:00.000Z', '2026-10-28T21:30:00.000Z', '2026-11-28T22:30:00.000Z'])
occ('the first Monday of every month, from Sunday 1 November', '2026-11-01T08:00:00.000Z', 'FREQ=MONTHLY;BYDAY=1MO', 'UTC', '2026-11-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z',
  ['2026-11-02T08:00:00.000Z', '2026-12-07T08:00:00.000Z', '2027-01-04T08:00:00.000Z', '2027-02-01T08:00:00.000Z', '2027-03-01T08:00:00.000Z'])
occ('the second Tuesday of every month at 09:00 London, through both clock changes', '2026-10-01T08:00:00.000Z', 'FREQ=MONTHLY;BYDAY=2TU', 'Europe/London', '2026-10-01T00:00:00.000Z', '2027-04-15T00:00:00.000Z',
  ['2026-10-13T08:00:00.000Z', '2026-11-10T09:00:00.000Z', '2026-12-08T09:00:00.000Z', '2027-01-12T09:00:00.000Z', '2027-02-09T09:00:00.000Z', '2027-03-09T09:00:00.000Z', '2027-04-13T08:00:00.000Z'])
occ('the fifth Friday: only the months that have one', '2026-01-01T08:00:00.000Z', 'FREQ=MONTHLY;BYDAY=5FR', 'UTC', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
  ['2026-01-30T08:00:00.000Z', '2026-05-29T08:00:00.000Z', '2026-07-31T08:00:00.000Z', '2026-10-30T08:00:00.000Z'])
occ('the last Sunday of every month (-1SU) at 02:30 London, through both clock changes', '2026-10-01T01:30:00.000Z', 'FREQ=MONTHLY;BYDAY=-1SU', 'Europe/London', '2026-10-01T00:00:00.000Z', '2027-05-01T00:00:00.000Z',
  ['2026-10-25T02:30:00.000Z', '2026-11-29T02:30:00.000Z', '2026-12-27T02:30:00.000Z', '2027-01-31T02:30:00.000Z', '2027-02-28T02:30:00.000Z', '2027-03-28T01:30:00.000Z', '2027-04-25T01:30:00.000Z'])
occ('the second-to-last Friday of every month (-2FR), through a leap February', '2028-01-01T08:00:00.000Z', 'FREQ=MONTHLY;BYDAY=-2FR', 'UTC', '2028-01-01T00:00:00.000Z', '2028-06-01T00:00:00.000Z',
  ['2028-01-21T08:00:00.000Z', '2028-02-18T08:00:00.000Z', '2028-03-24T08:00:00.000Z', '2028-04-21T08:00:00.000Z', '2028-05-19T08:00:00.000Z'])
occ('the fourth Thursday of every month at noon New York (Thanksgiving in November)', '2026-11-01T17:00:00.000Z', 'FREQ=MONTHLY;BYDAY=4TH', 'America/New_York', '2026-11-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z',
  ['2026-11-26T17:00:00.000Z', '2026-12-24T17:00:00.000Z', '2027-01-28T17:00:00.000Z', '2027-02-25T17:00:00.000Z'])
occ('a week starts on Monday when WKST is left out: every second week, Tuesday and Sunday', '2026-08-04T09:00:00.000Z', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU', 'UTC', '2026-08-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
  ['2026-08-04T09:00:00.000Z', '2026-08-09T09:00:00.000Z', '2026-08-18T09:00:00.000Z', '2026-08-23T09:00:00.000Z'])
occ('WKST=SU makes the week start on Sunday and so moves the Sunday into the next week', '2026-08-04T09:00:00.000Z', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU', 'UTC', '2026-08-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
  ['2026-08-04T09:00:00.000Z', '2026-08-16T09:00:00.000Z', '2026-08-18T09:00:00.000Z', '2026-08-30T09:00:00.000Z'])
occ("every weekday is the weekday on the zone's wall: Saturday 00:30 in Nairobi is no weekday", '2026-11-06T21:30:00.000Z', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Africa/Nairobi', '2026-11-06T00:00:00.000Z', '2026-11-12T00:00:00.000Z',
  ['2026-11-08T21:30:00.000Z', '2026-11-09T21:30:00.000Z', '2026-11-10T21:30:00.000Z', '2026-11-11T21:30:00.000Z'])
occ('the last day of every month at 07:00 New York', '2026-01-31T12:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=-1', 'America/New_York', '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  ['2026-01-31T12:00:00.000Z', '2026-02-28T12:00:00.000Z', '2026-03-31T11:00:00.000Z', '2026-04-30T11:00:00.000Z', '2026-05-31T11:00:00.000Z'])
occ('every weekday across 29 February 2028 in New York', '2028-02-25T10:00:00.000Z', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'America/New_York', '2028-02-25T00:00:00.000Z', '2028-03-08T00:00:00.000Z',
  ['2028-02-25T10:00:00.000Z', '2028-02-28T10:00:00.000Z', '2028-02-29T10:00:00.000Z', '2028-03-01T10:00:00.000Z', '2028-03-02T10:00:00.000Z', '2028-03-03T10:00:00.000Z', '2028-03-06T10:00:00.000Z', '2028-03-07T10:00:00.000Z'])
occ('every Friday: a window long after the start still lands on Fridays, over the year boundary', '2026-01-02T09:00:00.000Z', 'FREQ=WEEKLY;BYDAY=FR', 'UTC', '2026-12-20T00:00:00.000Z', '2027-01-10T00:00:00.000Z',
  ['2026-12-25T09:00:00.000Z', '2027-01-01T09:00:00.000Z', '2027-01-08T09:00:00.000Z'])
occ('every month on day 31, COUNT=3: the first three that exist', '2026-01-01T12:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', 'UTC', '2026-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z',
  ['2026-01-31T12:00:00.000Z', '2026-03-31T12:00:00.000Z', '2026-05-31T12:00:00.000Z'])
occ('the last weekday of every month (BYSETPOS=-1), from a leap February', '2028-02-01T12:00:00.000Z', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'UTC', '2028-02-01T00:00:00.000Z', '2028-07-01T00:00:00.000Z',
  ['2028-02-29T12:00:00.000Z', '2028-03-31T12:00:00.000Z', '2028-04-28T12:00:00.000Z', '2028-05-31T12:00:00.000Z', '2028-06-30T12:00:00.000Z'])
occ('the first Friday of every month, from the first Friday of December', '2026-12-04T09:00:00.000Z', 'FREQ=MONTHLY;BYDAY=1FR', 'UTC', '2026-12-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z',
  ['2026-12-04T09:00:00.000Z', '2027-01-01T09:00:00.000Z', '2027-02-05T09:00:00.000Z', '2027-03-05T09:00:00.000Z'])
occ('every month on the second to last day (-2): February 2028 has 29 days', '2028-01-01T12:00:00.000Z', 'FREQ=MONTHLY;BYMONTHDAY=-2', 'UTC', '2028-01-01T00:00:00.000Z', '2028-06-01T00:00:00.000Z',
  ['2028-01-30T12:00:00.000Z', '2028-02-28T12:00:00.000Z', '2028-03-30T12:00:00.000Z', '2028-04-29T12:00:00.000Z', '2028-05-30T12:00:00.000Z'])
occ('every second Friday over the year boundary', '2026-11-06T08:00:00.000Z', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', 'UTC', '2026-11-01T00:00:00.000Z', '2027-01-15T00:00:00.000Z',
  ['2026-11-06T08:00:00.000Z', '2026-11-20T08:00:00.000Z', '2026-12-04T08:00:00.000Z', '2026-12-18T08:00:00.000Z', '2027-01-01T08:00:00.000Z'])

// what the four forms do not take, never guessed
refused('a number before the day is the month\'s or the year\'s, never the week\'s: 1FR beside FREQ=WEEKLY', 'FREQ=WEEKLY;BYDAY=1FR')
refused('day 0 of a month is no day', 'FREQ=MONTHLY;BYMONTHDAY=0')
refused('day 32 of a month is no day', 'FREQ=MONTHLY;BYMONTHDAY=32')
refused('a weekday that is not one of MO TU WE TH FR SA SU', 'FREQ=WEEKLY;BYDAY=XX')
refused('0 before a weekday is no place in the month', 'FREQ=MONTHLY;BYDAY=0MO')
refused('a week that starts on a day that is not a weekday', 'FREQ=WEEKLY;BYDAY=FR;WKST=XX')

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
