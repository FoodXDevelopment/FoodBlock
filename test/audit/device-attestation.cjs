// Case 12: device attestation (patterns/attestations.md, Devices): "this device, set up by X, reported Y at T". A sensor is a thing; its
// owner's word is her own key: a device signs its readings with a key of hers; a key of anyone else's signs their word, never hers.
const { fb, World, kindOf } = require('./lib.cjs')
const P = require('../../spec/schemas/published.json')
const GBP = (value) => ({ value, unit: 'GBP' })
const w = new World('case12 device attestation')
w.useSchemas = true
w.blocks.push(P.genesis)
for (const name of P.order) w.blocks.push(P.schemas[name])
const S = (name) => P.schemas[name].hash

const farmer = w.person('farmer'), installer = w.person('installer'), maker = w.person('manufacturer'), device = w.person('device', 'machine')
const rogue = w.person('rogue-device', 'machine'), liar = w.person('liar'), pool = w.person('pool'), mia = w.person('mia')
const sensor = w.w(farmer, 'thing', { kind: 'sensor', name: 'frost probe', marks: [{ scheme: 'serial', value: 'FP-9' }] }, { of: kindOf('sensor') }, 'sensor thing (the farmer made it)')
// the manufacturer attests the device key; the installer attests it was put in this device
w.w(maker, 'observe', { kind: 'attestation', scheme: 'secure_element', value: 'SE-77', kind_of: 'device' }, { subject: device.id, schema: S('attestation') }, 'manufacturer attests the device key')
w.w(installer, 'observe', { kind: 'attestation', scheme: 'installed_by', value: 'FP-9', kind_of: 'device' }, { subject: device.id, from: sensor.hash, schema: S('attestation') }, 'installer attests it set the device up at the probe')
// who may sign the probe's readings: the owner says so; a grant the installer or a stranger signs is no such word
// A device signs the probe's readings with a key of its owner's (identity.md: a voice is her,
// whole): her readings are her word. A stranger's or the installer's device signs with their own key: their word, not the owner's.
const farmerDev = w.deviceKey(farmer, 'the farmer\'s device'), installerDev = w.deviceKey(installer, 'the installer\'s device on the rogue box'), liarDev = w.deviceKey(liar, 'the liar\'s device')
const T = (h) => `2026-11-03T${String(h).padStart(2, '0')}:00:00.000Z`
const read = (who, h, value, note) => w.w(who, 'observe', { kind: 'temperature', amount: { value, unit: 'Cel' } }, { from: sensor.hash, schema: S('reading') }, note, { at: T(h) })
const r0 = read(farmerDev, 1, '3', 'device: 3 C at 01:00'), r1 = read(farmerDev, 2, '-2', 'device: -2 C at 02:00'), r2 = read(farmerDev, 3, '-3', 'device: -3 C at 03:00')
const liarLow = read(installerDev, 3, '-9', 'rogue: -9 C at 03:00')
read(liarDev, 3, '-12', 'rogue (the liar\'s key): -12 C at 03:00')
const ownReading = read(farmer, 4, '-1', 'the owner\'s own reading: -1 C at 04:00')
w.w(installer, 'observe', { kind: 'receipt' }, { derives_from: r2.hash }, 'edge receipt for the 03:00 reading', { at: T(3) })
// a frost cover: pays if the probe reads below zero for an hour (the sensor_confirmed schema)
const frost = { reading: sensor.hash, kind: 'temperature', op: 'lt', value: { value: '0', unit: 'Cel' }, over: 'PT1H' }
w.frost = frost
w.w(pool, 'promise', { what: 'frost cover 200', terms: { lines: [{ id: 'cover', price: GBP('2') }], condition: frost, expires: '2027-03-01T00:00:00.000Z' } }, { from: pool.id, to: mia.id, schema: S('sensor_confirmed') }, 'frost cover (sensor_confirmed)')
w.report()
module.exports = { w, sensor }
