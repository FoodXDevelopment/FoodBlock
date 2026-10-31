// Durable state for the hosted door: one JSON file, written whole and renamed into place after every change (so a crash leaves the old
// file or the new one, never half of one). It holds what must survive a restart: registered clients, tokens (as hashes), sessions and
// accounts. Put it on a durable disk (EFS). The people's own data lives on the host, not here; this is only who may reach the door.
// `seal` / `open` keep a person's signing keys encrypted at rest under a key derived from the operator's master secret.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function durableState(file, { collections = ["clients", "access", "refresh", "sessions", "accounts", "identities", "operator"] } = {}) {
  const data = Object.fromEntries(collections.map((name) => [name, {}]));
  if (file && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    for (const name of collections) data[name] = saved[name] || {};
  }
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
    renameSync(temp, file);
  };
  const table = (name) => ({
    get: (key) => data[name][key],
    set: (key, value) => { data[name][key] = value; save(); return value; },
    delete: (key) => { const had = key in data[name]; delete data[name][key]; if (had) save(); return had; },
    entries: () => Object.entries(data[name]),
    size: () => Object.keys(data[name]).length,
    /** Remove every row the test says to drop, in one write. */
    prune: (drop) => { let n = 0; for (const [key, value] of Object.entries(data[name])) if (drop(value, key)) { delete data[name][key]; n++; } if (n) save(); return n; },
  });
  return Object.fromEntries(collections.map((name) => [name, table(name)]));
}

/** AES-256-GCM under a key derived from the master secret; returns { seal(object), open(sealed) }. */
export function sealer(master) {
  if (!master || Buffer.from(master).length < 32) throw new Error("the door's master secret must be at least 32 bytes");
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(master), Buffer.alloc(0), "foodblock/door/identities/v1", 32));
  return {
    seal(object) {
      const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(object), "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
    },
    open(sealed) {
      const raw = Buffer.from(sealed, "base64"), decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    },
  };
}

/** Write a sealed JSON file whole and rename it into place (a crash leaves the old file or the new one). */
function writeSealed(file, seal, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, seal.seal(value), { mode: 0o600 });
  renameSync(temp, file);
}
const readSealed = (file, seal) => { try { return existsSync(file) ? seal.open(readFileSync(file, "utf8")) : null; } catch { return null; } };

/**
 * Drafts that survive a restart: draftsFor(personId) is a Map of that person's drafts, kept sealed in <dir>/<personId>.json. The door calls
 * map.touch() after every change; the file is written at once (drafts are rare and small). A draft holds the signed-for spec and, for a
 * grant, the assistant's keys, so the file is sealed like the identities.
 */
export function durableDrafts(dir, seal) {
  const maps = new Map();
  return (personId) => {
    if (maps.has(personId)) return maps.get(personId);
    const file = `${dir}/${String(personId).replace(/[^a-z0-9]/gi, "")}.json`;
    const map = new Map(Object.entries(readSealed(file, seal) || {}));
    map.touch = () => writeSealed(file, seal, Object.fromEntries(map));
    maps.set(personId, map);
    return map;
  };
}

/** MCP sessions that survive a restart (server.js mcpEndpoint { store }): one sealed file; `seen` is written at most every 10 minutes. */
export function durableSessions(file, seal) {
  const data = readSealed(file, seal) || {};
  const save = () => writeSealed(file, seal, data);
  return {
    get: (id) => data[id],
    set: (id, record) => { data[id] = record; save(); },
    delete: (id) => { if (id in data) { delete data[id]; save(); } },
    touch: (id) => { const r = data[id]; if (r && Date.now() - r.seen > 600e3) { r.seen = Date.now(); save(); } },
    prune: (olderThanMs) => { let n = 0; for (const [id, r] of Object.entries(data)) if (Date.now() - r.seen > olderThanMs) { delete data[id]; n++; } if (n) save(); },
    size: () => Object.keys(data).length,
    ids: () => Object.keys(data),
  };
}
