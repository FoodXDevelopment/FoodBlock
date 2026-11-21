#!/usr/bin/env node
// node src/files/cli.mjs init|serve|export|import|sync   (data folder: --dir, default ./data)
import fs from 'node:fs'
import { initHost, openHost } from './host.mjs'
import { serve } from './server.mjs'

const [command, ...rest] = process.argv.slice(2)
const flags = {}; for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? 'true' : rest[++i]
const dir = flags.dir || 'data'
const usage = `foodblock reference node
  init   [--dir D] --cap N --per-stranger N --strangers-per-day N --admission HASH|none --copy-recipients N --copy-bytes N
         --serves-pairs true|false --takes-pairs true|false [--allow id,id]   make this host's own key and promise (every number is the owner's to state)
  serve  [--dir D] [--port 8787] [--bind 127.0.0.1]
  export [--dir D] [--author id] [--out file]    her record as plain FoodBlocks
  import [--dir D] --file file                   load a record (all or nothing)
  sync   [--dir D] --peer http://host:port       take what the other host has, give what it lacks`
try {
  if (command === 'init') {
    const whole = (name) => (/^\d+$/.test(flags[name] ?? '') ? Number(flags[name]) : undefined)
    const host = initHost(dir, { cap: whole('cap'), perStranger: whole('per-stranger'), strangersPerDay: whole('strangers-per-day'), copyRecipients: whole('copy-recipients'), copyBytes: whole('copy-bytes'), admission: flags.admission === 'none' ? null : flags.admission, servesPairs: flags['serves-pairs'] === 'true' ? true : flags['serves-pairs'] === 'false' ? false : undefined, takesPairs: flags['takes-pairs'] === 'true' ? true : flags['takes-pairs'] === 'false' ? false : undefined, allow: flags.allow ? flags.allow.split(',') : null })
    // the token is never printed (terminal history and CI logs keep what is printed): it is in the owner's own file, private to the owner
    console.log(`host ${host.node}\nowner token (needed to start a sync over HTTP): in ${dir}/host.json, readable by you alone`)
  } else if (command === 'serve') {
    const host = openHost(dir), port = Number(flags.port || 8787), server = await serve(host, { port, bind: flags.bind || '127.0.0.1' })
    for (const t of host.torn) console.error(`warning: ${t.file} ended in half a line (${t.bytes} bytes, left by a crash); set aside in ${t.file}.torn, the rest is kept`)
    console.log(`host ${host.node} listening on ${flags.bind || '127.0.0.1'}:${server.address().port}, ${host.store.count()} blocks held`)
  } else if (command === 'export') {
    const text = JSON.stringify(openHost(dir).exportRecord(flags.author ? flags.author.split(',') : [], { copies: 'all' }), null, 1)
    if (flags.out) fs.writeFileSync(flags.out, text, { mode: 0o600 }); else console.log(text)
  } else if (command === 'import') {
    const result = openHost(dir).importRecord(JSON.parse(fs.readFileSync(flags.file, 'utf8')), { withCopies: true, owner: true })
    console.log(JSON.stringify(result, null, 1)); if (!result.wrote) process.exitCode = 1
  } else if (command === 'sync') {
    console.log(JSON.stringify(await openHost(dir).sync(flags.peer)))
  } else console.log(usage)
} catch (error) { console.error(error.message); process.exitCode = 1 }
