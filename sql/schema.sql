-- The FoodBlock 1.6 node store (server/). Append-only: the node inserts and reads, never updates or deletes a block.
-- Each block is kept exactly as it arrived, whatever version it was written under: a public block as its message
-- { version, block, signature }, a sealed one as its signed public header { version, header, header_signature }.
-- Older shapes are read as 1.6 when they are read (spec/aliases.json), never rewritten. A hash is recomputed on
-- arrival, never trusted.

CREATE TABLE IF NOT EXISTS blocks (
  n          BIGSERIAL PRIMARY KEY,           -- arrival number (spec §10): 1, 2, 3, never reused
  hash       TEXT UNIQUE NOT NULL,            -- SHA-256 of the canonical form, 64 lowercase hex
  author     TEXT NOT NULL,                   -- refs.author; a genesis is its own author (its hash)
  seq        BIGINT,                          -- its place in its signing key's chain; none for a genesis or history
  prev       TEXT,                            -- the key's previous block
  sealed     BOOLEAN NOT NULL,                -- only the public header is held here; copies hold the bodies
  message    JSONB NOT NULL,                  -- the message as it arrived (a sealed block without its envelope)
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now() -- this node's clock: used only to rate strangers, never to order
);

CREATE INDEX IF NOT EXISTS blocks_author ON blocks (author);

-- A sealed block's copy for one of this node's people (push `for`): served only to that person's signed pull.
CREATE TABLE IF NOT EXISTS copies (
  hash       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  message    JSONB NOT NULL,                  -- { version, header, header_signature, envelope }
  PRIMARY KEY (hash, recipient)
);

-- Pushed blocks whose key's previous block is not yet held (spec §10): they wait, are tried again with each push,
-- and expire after the node's own time (WAIT_TTL).
CREATE TABLE IF NOT EXISTS waiting (
  hash       TEXT PRIMARY KEY,
  message    JSONB NOT NULL,                  -- the message as it came
  recipient  TEXT,                            -- push `for`, for a sealed copy
  author     TEXT NOT NULL,
  needs      TEXT NOT NULL,                   -- the hash to ask for
  since      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nonces of signed pulls this node has answered: a nonce seen twice is a replay.
CREATE TABLE IF NOT EXISTS nonces (
  nonce      TEXT PRIMARY KEY,
  seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
