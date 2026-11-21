-- The FoodBlock node store (server/). Append-only: the node inserts and reads, never updates or deletes a block.
-- Each block is kept exactly as it arrived: a public block as its message { block, signature }, a sealed one as its signed
-- public header { header, header_signature }. A message carries no version. A hash is recomputed on arrival, never trusted.

CREATE TABLE IF NOT EXISTS blocks (
  n          BIGSERIAL PRIMARY KEY,           -- arrival number (spec §10): 1, 2, 3, never reused
  hash       TEXT UNIQUE NOT NULL,            -- the id: the hash of the canonical form in the signing key's suite
  author     TEXT NOT NULL,                   -- refs.author; a genesis is its own author (its hash)
  seq        BIGINT,                          -- its place in its signing key's chain; none for a genesis
  prev       TEXT,                            -- the key's previous block
  sealed     BOOLEAN NOT NULL,                -- only the public header is held here; copies hold the bodies
  message    TEXT NOT NULL,                   -- the message as it arrived, as JSON text (a sealed block without its envelope): text, not
                                              -- JSONB, which refuses \u0000 a valid block may hold
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now() -- this node's clock: used only to rate strangers, never to order
);

CREATE INDEX IF NOT EXISTS blocks_author ON blocks (author);

-- A sealed block's copy for one of this node's people (push `for`): served only to that person's signed pull.
CREATE TABLE IF NOT EXISTS copies (
  hash       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  message    TEXT NOT NULL,                   -- { header, header_signature, envelope }, as JSON text
  author     TEXT,                            -- who signed the block: the copy counts against their admission
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- this node's clock: used only to rate strangers
  PRIMARY KEY (hash, recipient)
);
ALTER TABLE copies ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE copies ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS copies_author ON copies (author);

-- Pushed blocks whose key's previous block is not yet held (spec §10): they wait, are tried again with each push,
-- and expire after the node's own time (WAIT_TTL).
CREATE TABLE IF NOT EXISTS waiting (
  hash       TEXT PRIMARY KEY,
  message    TEXT NOT NULL,                   -- the message as it came, as JSON text
  recipient  TEXT,                            -- push `for`, for a sealed copy
  author     TEXT NOT NULL,
  needs      TEXT NOT NULL,                   -- the hash to ask for
  since      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signed requests carry no time. A request carries a counter, which must be above the highest this node has seen from
-- its signer; or a challenge this node issued (GET /challenge), which is used once.
CREATE TABLE IF NOT EXISTS counters (
  signer     TEXT PRIMARY KEY,
  highest    BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS challenges (
  challenge  TEXT PRIMARY KEY,
  used       BOOLEAN NOT NULL DEFAULT false,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT now() -- this node's clock: housekeeping only
);
