// Durable state for the hosted door: one JSON file, written whole and renamed into place after every change (so a crash leaves the old
// file or the new one, never half of one). It holds what must survive a restart: registered clients, tokens (as hashes), sessions and
// accounts. Put it on a durable disk (EFS). The people's own data lives on the host, not here; this is only who may reach the door.
// `seal` / `open` keep a person's signing keys encrypted at rest under a key derived from the operator's master secret.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function durableState(file, { collections = ["clients", "access", "refresh", "sessions", "accounts", "identities"] } = {}) {
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
