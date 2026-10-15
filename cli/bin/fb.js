#!/usr/bin/env node
// The FoodBlock CLI (spec/protocol.md): the protocol from a terminal. Blocks are JSON on stdout, so they compose with
// anything else. Every check is the SDK's; `create` is the SDK's one write path (`write`: compose, check, sign, chain).
//
//   fb init <file> [--kind person|machine|agent]     a new identity: keys and genesis, saved to <file> (kept 0600);
//                                                    the recovery key goes to <file>.recovery.json: keep it offline
//   fb key <file> --identity <id file>               a new device key, brought in by a key grant, saved to <file> as
//                                                    { holder, key, blocks } (a node's NODE_KEY is one)
//   fb create <type> [kind] --state '{...}' --refs '{...}' [--audience public|<id,id>] [--identity <file>]
//                                                    a block in the identity's key chain, checked and signed
//   fb check <type> --state '{...}' --refs '{...}'   what is wrong with a block, in plain words
//   fb read-as '<block json>'                        a block of any earlier version, read as the current one
//   fb verify '<signed block json>' [--identity <file> | '<genesis json>']
//                                                    whether its author signed exactly this, with a key that speaks
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
function identity() {
  const file = flag('identity') || process.env.FOODBLOCK_IDENTITY;
  if (!file) fail('give --identity <file> (or FOODBLOCK_IDENTITY); make one with fb init');
  if (!existsSync(file)) fail(`no identity at ${file}; make one with fb init`);
  return { file, ...JSON.parse(readFileSync(file, 'utf8')) };
}

if (command === 'init') {
  const file = words[0];
  if (!file) fail('init needs a file to keep the identity in');
  fresh(file); fresh(`${file}.recovery.json`);
  const keys = fb.generateKeypair(), encryption = fb.generateEncryptionKeypair(), recovery = fb.generateKeypair();
  const genesis = fb.identity.genesis(keys, { kind: flag('kind') || 'person', encryptionKey: encryption.public_key_encrypt, recoveryKey: recovery.public_key_sign });
  save(`${file}.recovery.json`, { id: genesis.hash, recovery });
  save(file, { keys, encryption, genesis, chain: [genesis] });
  out(genesis);
} else if (command === 'key') {
  const file = words[0];
  if (!file) fail('key needs a file to keep the new key in');
  fresh(file);
  const me = identity(), id = me.genesis.hash, device = fb.generateKeypair();
  const last = fb.identity.chainsOf(id, me.chain).find((chain) => chain.key === me.keys.public_key_sign)?.head || null;
  const grant = fb.identity.keyGrant(id, device.public_key_sign, { private_key: me.keys.private_key, last, broughtIn: id });
  const chain = [...me.chain, grant];
  save(me.file, { keys: me.keys, encryption: me.encryption, genesis: me.genesis, chain });
  save(file, { holder: id, key: device, blocks: chain });
  out(grant);
} else if (command === 'create') {
  const [type, kind] = words;
  if (!type) fail('create needs a type');
  const me = identity();
  const audience = !flag('audience') || flag('audience') === 'public' ? 'public' : flag('audience').split(',');
  let signed;
  try {
    signed = fb.write(type, { ...(kind ? { kind } : {}), ...json(flag('state'), '--state') }, json(flag('refs'), '--refs'),
      { author: me.genesis.hash, key: me.keys, held: me.chain, audience });
  } catch (error) { fail(error.message); }
  const { salts, ...block } = signed;
  save(me.file, { keys: me.keys, encryption: me.encryption, genesis: me.genesis, chain: [...me.chain, block] });
  out(signed);
} else if (command === 'check') out({ errors: fb.check(words[0], json(flag('state'), '--state'), json(flag('refs'), '--refs')) });
else if (command === 'read-as') out(fb.readAs(json(words[0], 'the block')));
else if (command === 'verify') {
  const signed = json(words[0], 'the block');
  const held = flag('identity') ? identity().chain : [words[1] ? json(words[1], 'the genesis') : signed];
  out({ signedByItsAuthor: fb.identity.signedByAuthor({ ...signed, hash: fb.hash(signed.type, signed.state, signed.refs) }, held) });
} else {
  process.stdout.write(`FoodBlock ${fb.VERSION}: fb init | key | create | check | read-as | verify (see the top of bin/fb.js)\n`);
  if (command) process.exit(1);
}
