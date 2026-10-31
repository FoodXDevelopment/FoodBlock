#!/usr/bin/env node
// The FoodBlock CLI (spec/core.md): the protocol from a terminal. Blocks are JSON on stdout, so they compose with
// anything else. Every check is the SDK's; `create` is the SDK's one write path (`write`: compose, check, sign, chain).
//
//   fb init <file> --kind person|machine|agent --audience public|<id,id> --reach <duration>
//                                                    a new identity: keys and genesis, saved to <file> (kept 0600); both flags are required;
//                                                    the recovery key goes to <file>.recovery.json: keep it offline
//   fb key <file> --identity <id file>               a new device key, brought in by a key grant, saved to <file> as
//                                                    { holder, key, blocks } (a node's NODE_KEY is one)
//   fb create <type> [kind] --state '{...}' --refs '{...}' --audience public|<id,id> [--identity <file>]
//                                                    a block in the identity's key chain, checked and signed
//   fb check <type> --state '{...}' --refs '{...}'   what is wrong with a block, in plain words
//   fb valid '<signed block json>' --identity <file> every refusal of a block against the blocks the identity holds
//   fb convert <old blocks file> --keys <keys file> [--at <time>] [--map <map file>] [--custodian-key <file> --custodian-for <file>] [--schemas <file>]
//                                                    the ONE-TIME converter for blocks from before 1.6 (not part of
//                                                    the protocol): fresh blocks signed by the key you give for
//                                                    each old identity, each deriving from the old hash. <keys file>
//                                                    is { "<old genesis hash>": { public_key_sign, private_key } }.
//                                                    Prints { blocks, map, skipped, deliveries }; --map continues an earlier run.
//                                                    A block with no audience becomes its author's alone; --custodian-key signs only for
//                                                    the old ids listed in --custodian-for (a JSON list), under a channel. Nothing is filled in.
//   fb verify '<signed block json>' [--identity <file> | '<genesis json>']
//                                                    whether its author signed exactly this, with a key that speaks
//
// Nothing is filled in for the person: a missing --kind, --audience or --reach is refused (non-zero exit, the reason on stderr). The CLI states
// `at` itself, from its own clock at the call, as an ISO time; the SDK reads no clock.
//
// The identity file holds every block it signs, so each new one takes the next place in the chain. FOODBLOCK_IDENTITY
// names it when --identity is not given.
import fb from '@foodxdev/foodblock';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [command, ...rest] = process.argv.slice(2);
const flag = (name) => { const index = rest.indexOf(`--${name}`); return index >= 0 ? rest[index + 1] : undefined; };
const words = rest.filter((arg, index) => !arg.startsWith('--') && !(index > 0 && rest[index - 1].startsWith('--')));
const json = (value, name) => { try { return value === undefined ? {} : JSON.parse(value); } catch { fail(`${name} is not JSON`); } };
const out = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
const fresh = (file) => { if (existsSync(file)) fail(`${file} already exists`); return file; };
function fail(message) { process.stderr.write(`fb: ${message}\n`); process.exit(1); }
const now = () => new Date().toISOString();
// who may read the block: asked for every time, "public" or a comma list of ids; nothing is chosen for the person
function audienceOf() {
  const value = flag('audience');
  if (!value || value.startsWith('--')) fail('--audience is required: public, or the ids that may read it, comma separated');
  return value === 'public' ? 'public' : value.split(',').map((id) => id.trim()).filter(Boolean);
}
function identity() {
  const file = flag('identity') || process.env.FOODBLOCK_IDENTITY;
  if (!file) fail('give --identity <file> (or FOODBLOCK_IDENTITY); make one with fb init');
  if (!existsSync(file)) fail(`no identity at ${file}; make one with fb init`);
  return { file, ...JSON.parse(readFileSync(file, 'utf8')) };
}

if (command === 'init') {
  const file = words[0];
  if (!file) fail('init needs a file to keep the identity in');
  if (!flag('kind') || flag('kind').startsWith('--')) fail('--kind is required: person, machine or agent');
  if (!flag('reach') || flag('reach').startsWith('--')) fail('--reach is required: how long after a theft a recovery key may reach back, as a duration (for example P30D)');
  const audience = audienceOf();
  fresh(file); fresh(`${file}.recovery.json`);
  const keys = fb.generateKeypair(), encryption = fb.generateEncryptionKeypair(), recovery = fb.generateKeypair();
  let signed;
  try { signed = fb.identity.genesis(keys, { kind: flag('kind'), at: now(), audience, encryptionKey: encryption.public_key_encrypt, recoveryKey: recovery.public_key_sign, reach: flag('reach') }); } catch (error) { fail(error.message); }
  const { salts, ...genesis } = signed;
  save(`${file}.recovery.json`, { id: genesis.hash, recovery });
  save(file, { keys, encryption, genesis, chain: [genesis] });
  out(signed);
} else if (command === 'key') {
  const file = words[0];
  if (!file) fail('key needs a file to keep the new key in');
  fresh(file);
  const me = identity(), id = me.genesis.hash, device = fb.generateKeypair();
  const headHash = fb.identity.chainsOf(id, me.chain).find((chain) => chain.key === me.keys.public_key_sign)?.head;
  const last = me.chain.find((block) => block.hash === headHash) || null;
  const grant = fb.identity.keyGrant(id, device.public_key_sign, { private_key: me.keys.private_key, last, broughtIn: id }, { at: now() });
  const chain = [...me.chain, grant];
  save(me.file, { keys: me.keys, encryption: me.encryption, genesis: me.genesis, chain });
  save(file, { holder: id, key: device, blocks: chain });
  out(grant);
} else if (command === 'create') {
  const [type, kind] = words;
  if (!type) fail('create needs a type');
  const me = identity();
  const audience = audienceOf();
  let signed;
  try {
    signed = fb.write(type, { ...(kind ? { kind } : {}), ...json(flag('state'), '--state') }, json(flag('refs'), '--refs'),
      { author: me.genesis.hash, key: me.keys, held: me.chain, at: now(), audience });
  } catch (error) { fail(error.message); }
  const { salts, ...block } = signed;
  save(me.file, { keys: me.keys, encryption: me.encryption, genesis: me.genesis, chain: [...me.chain, block] });
  out(signed);
} else if (command === 'check') out({ errors: fb.check(words[0], json(flag('state'), '--state'), json(flag('refs'), '--refs')) });
else if (command === 'valid') {
  const block = json(words[0], 'the block');
  // the id is computed here, in the suite of the key that signed it (core.md, section 2): never taken from the block or a label
  const held = identity().chain.filter((one) => one.hash !== block.hash);
  out({ refusals: fb.valid({ ...block, hash: fb.idOf(block, held) }, held) });
} else if (command === 'convert') {
  const [file] = words;
  if (!file || !flag('keys')) fail('convert needs <old blocks file> and --keys <keys file>');
  const old = json(readFileSync(file, 'utf8'), file), keys = json(readFileSync(flag('keys'), 'utf8'), '--keys');
  const earlier = flag('map') && existsSync(flag('map')) ? json(readFileSync(flag('map'), 'utf8'), '--map') : { map: {}, blocks: [] };
  let done;
  try { done = fb.legacy.convert(Array.isArray(old) ? old : old.blocks, { keys, at: flag('at') || new Date().toISOString(), map: earlier.map, existing: earlier.blocks, ...(flag('custodian-key') ? { custodianKey: json(readFileSync(flag('custodian-key'), 'utf8'), '--custodian-key') } : {}), ...(flag('custodian-for') ? { custodianFor: json(readFileSync(flag('custodian-for'), 'utf8'), '--custodian-for') } : {}), ...(flag('schemas') ? { schemas: json(readFileSync(flag('schemas'), 'utf8'), '--schemas') } : {}) }); } catch (error) { fail(error.message); }
  if (flag('map')) save(flag('map'), { map: done.map, blocks: [...earlier.blocks, ...done.blocks] });
  out(done);
}
else if (command === 'verify') {
  const signed = json(words[0], 'the block');
  const held = flag('identity') ? identity().chain : [words[1] ? json(words[1], 'the genesis') : signed];
  out({ signedByItsAuthor: fb.identity.signedByAuthor({ ...signed, hash: fb.hash(signed.type, signed.state, signed.refs) }, held) });
} else {
  process.stdout.write(`FoodBlock ${fb.VERSION}: fb init | key | create | check | valid | convert | verify (see the top of bin/fb.js)\n`);
  if (command) process.exit(1);
}
