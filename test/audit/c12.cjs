// Case 12: device attestation (profiles/attestations.md, Devices): "this device, set up by X, reported Y at T". A sensor is a thing; its
// owner says who may sign its readings; a grant anyone else signs makes no one an operator of someone's sensor.
const { fb, World } = require('./lib.cjs')
const P = require('../../spec/schemas/published.json')
const GBP = (minor) => ({ minor, currency: 'GBP' })
const w = new World('case12 device attestation')
w.useSchemas = true
w.blocks.push(P.genesis)
for (const name of P.order) w.blocks.push(P.schemas[name])
const S = (name) => P.schemas[name].hash

const farmer = w.person('farmer'), installer = w.person('installer'), maker = w.person('manufacturer', 'business'), device = w.person('device', 'machine')
const rogue = w.person('rogue-device', 'machine'), liar = w.person('liar'), pool = w.person('pool'), mia = w.person('mia')
const sensor = w.w(farmer, 'thing', { kind: 'sensor', name: 'frost probe', marks: [{ scheme: 'serial', value: 'FP-9' }] }, {}, 'sensor thing (the farmer made it)')
// the manufacturer attests the device key; the installer attests it was put in this device
w.w(maker, 'observe', { kind: 'attestation', scheme: 'secure_element', value: 'SE-77', kind_of: 'device' }, { subject: device.id, schema: S('attestation') }, 'manufacturer attests the device key')
w.w(installer, 'observe', { kind: 'attestation', scheme: 'installed_by', value: 'FP-9', kind_of: 'device' }, { subject: device.id, from: sensor.hash, schema: S('attestation') }, 'installer attests it set the device up at the probe')
// who may sign the probe's readings: the owner says so; a grant the installer or a stranger signs is no such word
const owner = w.w(farmer, 'grant', { kind: 'operator' }, { to: device.id, subject: sensor.hash }, 'the owner names the device an operator of the probe')
const forged = w.w(liar, 'grant', { kind: 'operator' }, { to: rogue.id, subject: sensor.hash }, 'a stranger names a rogue device an operator of the probe')
const byInstaller = w.w(installer, 'grant', { kind: 'operator' }, { to: rogue.id, subject: sensor.hash }, 'the installer (not the owner) names the rogue device')
const T = (h) => `2026-11-03T${String(h).padStart(2, '0')}:00:00.000Z`
const read = (who, h, value, note) => w.w(who, 'observe', { kind: 'temperature', amount: { value, unit: 'Cel' } }, { from: sensor.hash, schema: S('reading') }, note, { at: T(h) })
const r0 = read(device, 1, '3', 'device: 3 C at 01:00'), r1 = read(device, 2, '-2', 'device: -2 C at 02:00'), r2 = read(device, 3, '-3', 'device: -3 C at 03:00')
const liarLow = read(rogue, 3, '-9', 'rogue: -9 C at 03:00')
const ownReading = read(farmer, 4, '-1', 'the owner\'s own reading: -1 C at 04:00')
w.w(installer, 'observe', { kind: 'receipt' }, { derives_from: r2.hash }, 'edge receipt for the 03:00 reading', { at: T(3) })
// a frost cover: pays if the probe reads below zero for an hour (the sensor_confirmed schema)
const frost = { reading: sensor.hash, kind: 'temperature', op: 'lt', value: { value: '0', unit: 'Cel' }, over: 'PT1H' }
w.frost = frost
w.w(pool, 'promise', { what: 'frost cover 200', terms: { price: GBP(200), condition: frost, expires: '2027-03-01T00:00:00.000Z' } }, { from: pool.id, to: mia.id, schema: S('sensor_confirmed') }, 'frost cover (sensor_confirmed)')
w.report()
module.exports = { w, sensor }
