-- FoodBlock Protocol Schema v0.4
-- Single table, append-only, content-addressable

CREATE TABLE IF NOT EXISTS foodblocks (
    hash             VARCHAR(64) PRIMARY KEY,
    type             VARCHAR(100) NOT NULL,
    state            JSONB NOT NULL DEFAULT '{}',
    refs             JSONB NOT NULL DEFAULT '{}',

    -- Authentication wrapper (Rule 7)
    author_hash      VARCHAR(64),
    signature        TEXT,
    protocol_version VARCHAR(10) DEFAULT '0.4',

    -- Derived columns (computed on write, not in hash)
    chain_id         VARCHAR(64),     -- genesis block hash for this update chain
    is_head          BOOLEAN DEFAULT TRUE,
    visibility       VARCHAR(32) DEFAULT 'public',
    created_at       TIMESTAMP DEFAULT NOW()
);

-- Type lookups (e.g. all substance.product blocks)
CREATE INDEX idx_fb_type ON foodblocks(type);

-- Ref traversal (e.g. all blocks referencing a specific hash)
CREATE INDEX idx_fb_refs ON foodblocks USING GIN(refs);

-- Author lookups (e.g. all blocks by a specific actor)
CREATE INDEX idx_fb_author ON foodblocks(author_hash);

-- Chain resolution (e.g. find head of update chain)
CREATE INDEX idx_fb_chain ON foodblocks(chain_id, is_head);

-- Timeline queries (e.g. latest blocks)
CREATE INDEX idx_fb_created ON foodblocks(created_at DESC);

-- Type + head (e.g. latest products)
CREATE INDEX idx_fb_type_head ON foodblocks(type, is_head) WHERE is_head = TRUE;

-- Visibility filtering (Section 7)
CREATE INDEX idx_fb_visibility ON foodblocks(visibility) WHERE is_head = TRUE;

-- Fork detection: prevent two blocks from updating the same predecessor
-- by the same author (Fix #7). Different authors can fork (handled by trigger).
CREATE UNIQUE INDEX idx_fb_updates_author_unique
  ON foodblocks (( refs->>'updates' ), author_hash)
  WHERE refs->>'updates' IS NOT NULL;


-- Trigger: on INSERT, compute chain_id and update is_head
-- Implements author-scoped head resolution (Section 5.3)
CREATE OR REPLACE FUNCTION fb_on_insert() RETURNS TRIGGER AS $$
DECLARE
    prev_hash TEXT;
    prev_author TEXT;
    prev_chain TEXT;
BEGIN
    -- Extract updates ref (the block this one supersedes)
    prev_hash := NEW.refs->>'updates';

    IF prev_hash IS NOT NULL THEN
        -- Look up predecessor's author and chain
        SELECT author_hash, chain_id
        INTO prev_author, prev_chain
        FROM foodblocks WHERE hash = prev_hash;

        -- Tombstone blocks always succeed as chain updates (Section 5.4)
        IF NEW.type = 'observe.tombstone' THEN
            NEW.chain_id := COALESCE(prev_chain, prev_hash);
            UPDATE foodblocks SET is_head = FALSE WHERE hash = prev_hash;

        -- Same author (or no previous author): normal update
        ELSIF NEW.author_hash = prev_author OR prev_author IS NULL THEN
            NEW.chain_id := COALESCE(prev_chain, prev_hash);
            UPDATE foodblocks SET is_head = FALSE WHERE hash = prev_hash;

        -- Different author: check for explicit approval (Section 5.3)
        ELSIF EXISTS (
            SELECT 1 FROM foodblocks
            WHERE type = 'observe.approval'
              AND refs->>'grantee' = NEW.author_hash
              AND state->>'target_chain' = COALESCE(prev_chain, prev_hash)
              AND author_hash = prev_author
        ) THEN
            NEW.chain_id := COALESCE(prev_chain, prev_hash);
            UPDATE foodblocks SET is_head = FALSE WHERE hash = prev_hash;

        -- Different author, no approval: fork (new chain)
        ELSE
            NEW.chain_id := NEW.hash;
        END IF;
    ELSE
        -- Genesis block: chain_id is its own hash
        NEW.chain_id := NEW.hash;
    END IF;

    NEW.is_head := TRUE;

    -- Set visibility from state hint or type-based default (Section 7)
    IF NEW.state->>'visibility' IS NOT NULL THEN
        NEW.visibility := NEW.state->>'visibility';
    ELSIF NEW.type LIKE 'transfer.payment%' OR NEW.type LIKE 'transfer.subscription%' THEN
        NEW.visibility := 'direct';
    ELSIF NEW.type LIKE 'observe.reading%' THEN
        NEW.visibility := 'network';
    ELSIF NEW.type LIKE 'actor.agent%' THEN
        NEW.visibility := 'internal';
    ELSE
        NEW.visibility := 'public';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fb_insert
    BEFORE INSERT ON foodblocks
    FOR EACH ROW
    EXECUTE FUNCTION fb_on_insert();


-- Trigger: on tombstone INSERT, erase target block's content (Section 5.4, Rule 11)
CREATE OR REPLACE FUNCTION fb_on_tombstone() RETURNS TRIGGER AS $$
DECLARE
    target TEXT;
BEGIN
    target := NEW.refs->>'target';
    IF target IS NOT NULL THEN
        UPDATE foodblocks
        SET state = '{"tombstoned": true}'::jsonb
        WHERE hash = target;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fb_tombstone
    AFTER INSERT ON foodblocks
    FOR EACH ROW
    WHEN (NEW.type = 'observe.tombstone')
    EXECUTE FUNCTION fb_on_tombstone();


-- Notify on new block (for SSE stream)
CREATE OR REPLACE FUNCTION notify_new_block() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_block', json_build_object(
        'hash',        NEW.hash,
        'type',        NEW.type,
        'author_hash', NEW.author_hash
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_new_block
    AFTER INSERT ON foodblocks
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_block();


-- Federation peers
CREATE TABLE IF NOT EXISTS federation_peers (
    peer_url    TEXT PRIMARY KEY,
    peer_name   TEXT DEFAULT 'Unknown Peer',
    public_key  TEXT NOT NULL,
    last_sync   TIMESTAMPTZ,
    status      VARCHAR(32) DEFAULT 'active',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
