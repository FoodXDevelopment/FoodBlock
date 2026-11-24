#!/usr/bin/env node
// The FoodBlock CLI (spec/core.md): the protocol from a terminal. Blocks are JSON on stdout, so they compose with anything else. Every check is the SDK's.
//
// THIS COMMAND LINE HOLDS NO KEY. A person's key is made and kept on her own device (a passkey); nothing here makes, reads, stores or uses one. It
// composes a block for her device to sign, takes back the signature, and checks it.
//
//   fb adopt <file> --genesis <genesis.json | '<json>'>   keep her public identity: her genesis, checked (the file holds blocks only; kept 0600)
//   fb draft <type> [kind] --state '{...}' --refs '{...}' --audience public|<id,id> [--identity <file>]
//                                                    a block composed at the next place in her chain, NOT signed: { block, challenge, key }.
//                                                    Her device signs `block` (the challenge is for a passkey); nothing is saved
//   fb attach --draft '<json>' --signature <hex> [--identity <file>]
//                                                    check the signature is her key's over exactly that block, then add it to her chain
//   fb check <type> --state '{...}' --refs '{...}'   what is wrong with a block, in plain words
//   fb valid '<signed block json>' --identity <file> every refusal of a block against the blocks the identity holds
//   fb verify '<signed block json>' [--identity <file> | '<genesis json>']
//                                                    whether its author signed exactly this, with a key that speaks
//
// Nothing is filled in for the person: a missing --audience is refused (non-zero exit, the reason on stderr). The CLI states `at` itself, from its own
// clock at the call, as an ISO time; the SDK reads no clock.
//
// The identity file holds the blocks of her chain, so each new one takes the next place. FOODBLOCK_IDENTITY names it when --identity is not given.
import fb from '@foodxdev/foodblock';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const [command, ...rest] = process.argv.slice(2);
const flag = (name) => { const index = rest.indexOf(`--${name}`); return index >= 0 ? rest[index + 1] : undefined; };
const words = rest.filter((arg, index) => !arg.startsWith('--') && !(index > 0 && rest[index - 1].startsWith('--')));
const json = (value, name) => { try { return value === undefined ? {} : JSON.parse(value); } catch { fail(`${name} is not JSON`); } };
const out = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
// written beside itself and renamed into place, private to its owner: a crash leaves the old file or the new one, and the mode holds even if the file was there
const save = (file, value) => { const temp = `${file}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 }); renameSync(temp, file); };
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
  if (!file) fail('give --identity <file> (or FOODBLOCK_IDENTITY); keep her public identity there with fb adopt');
  if (!existsSync(file)) fail(`no identity at ${file}; keep one with fb adopt`);
  const held = JSON.parse(readFileSync(file, 'utf8'));
  if (held.keys || held.recovery || held.encryption || held.key) fail(`${file} holds a private key. This command line never reads one: keep the key on her device and give it a file with only { genesis, chain }`);
  return { file, genesis: held.genesis, chain: held.chain || [held.genesis] };
}
// the key her device signs with: the one key of her genesis, unless she names another that speaks for her
const signerKey = (me) => flag('key') || me.genesis.state.public_key_sign;

if (command === 'adopt') {
  const file = words[0];
  if (!file) fail('adopt needs a file to keep her public identity in');
  if (existsSync(file)) fail(`${file} already exists`);
  const raw = flag('genesis');
  if (!raw) fail('--genesis is required: her genesis block (a file, or JSON), made on her own device');
  const genesis = json(existsSync(raw) ? readFileSync(raw, 'utf8') : raw, '--genesis');
  if (genesis.keys || genesis.private_key) fail('that holds a private key; give the genesis block only');
  if (!fb.identity.isGenesis(genesis) || !fb.identity.genesisOpens(genesis)) fail('that is not a genesis her own key opens');
  save(file, { genesis, chain: [genesis] });
  out({ id: genesis.hash });
} else if (command === 'draft') {
  const [type, kind] = words;
  if (!type) fail('draft needs a type');
  const me = identity();
  const audience = audienceOf();
  const key = signerKey(me);
  let block;
  try {
    block = fb.compose(type, { ...(kind ? { kind } : {}), ...json(flag('state'), '--state') }, json(flag('refs'), '--refs'),
      { author: me.genesis.hash, at: now(), audience, link: fb.identity.nextLinkFor(me.genesis.hash, key, me.chain) });
    const wrong = fb.valid({ ...block, signature: '00' }, me.chain).filter((r) => r.code !== 'bad_signature');
    if (wrong.length) fail(`the block would be refused: ${wrong.map((r) => r.detail || r.code).join('; ')}`);
    // `valid` judges the block's shape; a value is judged by what a writer refuses to sign (write_refusals), asked of the unsigned draft
    const { hash, signature, ...draft } = block;
    const unsigned = fb.writeRefusals(draft, me.chain);
    if (unsigned.length) fail(`the block would be refused: ${unsigned.map((r) => r.detail || r.code).join('; ')}`);
  } catch (error) { fail(error.message); }
  out({ block, challenge: fb.passkeyChallenge(block), key });
} else if (command === 'attach') {
  const me = identity();
  const given = json(flag('draft'), '--draft'), signature = flag('signature');
  const block = given.block || given;
  if (!block?.type || !signature) fail('attach needs --draft (what fb draft printed) and --signature (hex, made on her device)');
  const key = given.key || signerKey(me);
  if (!fb.verify(block, signature, key)) fail('that is not her key\'s signature over exactly this block: nothing was added');
  const signed = { ...block, signature };
  const wrong = fb.valid(signed, me.chain.filter((one) => one.hash !== signed.hash));
  if (wrong.length) fail(`the block is refused: ${wrong.map((r) => r.detail || r.code).join('; ')}`);
  const { salts, ...kept } = signed;
  save(me.file, { genesis: me.genesis, chain: [...me.chain, kept] });
  out(signed);
} else if (command === 'check') {
  // the SDK has no check-alone call: the block is shaped and judged as valid() judges it, and only the missing signature is let go
  const type = words[0], state = json(flag('state'), '--state'), refs = json(flag('refs'), '--refs');
  let errors;
  try { errors = [...fb.valid({ hash: fb.hash(type, state, refs), type, state, refs, signature: '00' }, []).filter((r) => r.code !== 'bad_signature'), ...fb.writeRefusals({ type, state, refs }, [])].map((r) => r.detail || r.code); } catch (error) { errors = [error.message]; }
  out({ errors });
}
else if (command === 'valid') {
  const block = json(words[0], 'the block');
  // the id is computed here, in the suite of the key that signed it (core.md, section 2): never taken from the block or a label
  const blocks = identity().chain.filter((one) => one.hash !== block.hash);
  out({ refusals: fb.valid({ ...block, hash: fb.idOf(block, blocks) }, blocks) });
} else if (command === 'verify') {
  const signed = json(words[0], 'the block');
  const blocks = flag('identity') ? identity().chain : [words[1] ? json(words[1], 'the genesis') : signed];
  out({ signedByItsAuthor: fb.identity.signedByAuthor({ ...signed, hash: fb.hash(signed.type, signed.state, signed.refs) }, blocks) });
} else {
  process.stdout.write(`FoodBlock ${fb.VERSION}: fb adopt | draft | attach | check | valid | verify (see the top of bin/fb.js). This command line holds no key.\n`);
  if (command) process.exit(1);
}
