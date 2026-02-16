-- FoodBlock Protocol Schema
-- Single table, append-only, content-addressable

CREATE TABLE IF NOT EXISTS foodblocks (
    hash        VARCHAR(64) PRIMARY KEY,
    type        VARCHAR(100) NOT NULL,
    state       JSONB NOT NULL DEFAULT '{}',
    refs        JSONB NOT NULL DEFAULT '{}',

    -- Authentication wrapper (Rule 7)
    author_hash VARCHAR(64),
    signature   TEXT,

    -- Derived columns (computed on write, not in hash)
    chain_id    VARCHAR(64),     -- genesis block hash for this update chain
    is_head     BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
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


-- Trigger: on INSERT, compute chain_id and update is_head
CREATE OR REPLACE FUNCTION fb_on_insert() RETURNS TRIGGER AS $$
DECLARE
    prev_hash TEXT;
BEGIN
    -- Extract updates ref (the block this one supersedes)
    prev_hash := NEW.refs->>'updates';

    IF prev_hash IS NOT NULL THEN
        -- This is an update block: inherit chain_id from predecessor
        SELECT chain_id INTO NEW.chain_id FROM foodblocks WHERE hash = prev_hash;

        -- If predecessor not found, use prev_hash as chain_id
        IF NEW.chain_id IS NULL THEN
            NEW.chain_id := prev_hash;
        END IF;

        -- Mark predecessor as no longer head
        UPDATE foodblocks SET is_head = FALSE WHERE hash = prev_hash;
    ELSE
        -- Genesis block: chain_id is its own hash
        NEW.chain_id := NEW.hash;
    END IF;

    NEW.is_head := TRUE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fb_insert
    BEFORE INSERT ON foodblocks
    FOR EACH ROW
    EXECUTE FUNCTION fb_on_insert();
