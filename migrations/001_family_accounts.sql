-- MemoryVault Family Accounts
-- Creates a separate family-account system without changing personal users,
-- memories, or memory_attachments.
-- Run this ONLY on the before-familyvault-migration backup branch after review.

BEGIN;

CREATE TABLE IF NOT EXISTS family_accounts (
    id BIGSERIAL PRIMARY KEY,
    family_name TEXT NOT NULL CHECK (length(trim(family_name)) > 0),
    owner_name TEXT NOT NULL CHECK (length(trim(owner_name)) > 0),
    owner_username TEXT NOT NULL CHECK (length(trim(owner_username)) > 0),
    owner_email TEXT NOT NULL,
    owner_password_hash TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT family_accounts_owner_email_unique UNIQUE (owner_email)
);

CREATE TABLE IF NOT EXISTS family_members (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    username TEXT NOT NULL CHECK (length(trim(username)) > 0),
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT family_members_family_username_unique UNIQUE (family_id, username)
);

CREATE TABLE IF NOT EXISTS family_memories (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
    created_by_member_id BIGINT REFERENCES family_members(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    reveal_at TIMESTAMPTZ NOT NULL,
    category TEXT NOT NULL DEFAULT 'Family',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS family_memories_family_reveal_idx
    ON family_memories (family_id, reveal_at);

CREATE TABLE IF NOT EXISTS family_attachments (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
    memory_id BIGINT NOT NULL REFERENCES family_memories(id) ON DELETE CASCADE,
    uploaded_by_member_id BIGINT REFERENCES family_members(id) ON DELETE SET NULL,
    object_key TEXT NOT NULL UNIQUE,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    media_type VARCHAR(20) NOT NULL
        CHECK (media_type IN ('image', 'video', 'audio')),
    size_bytes BIGINT NOT NULL
        CHECK (size_bytes > 0 AND size_bytes <= 26214400),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS family_attachments_memory_idx
    ON family_attachments (family_id, memory_id);

-- One case-insensitive username namespace for all family owners and members.
-- Personal accounts remain separate and continue to use their existing login.
CREATE TABLE IF NOT EXISTS family_username_registry (
    username_key TEXT PRIMARY KEY,
    family_id BIGINT NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL CHECK (account_type IN ('owner', 'member')),
    account_id BIGINT NOT NULL,
    CONSTRAINT family_username_registry_account_unique
        UNIQUE (account_type, account_id)
);

CREATE OR REPLACE FUNCTION register_family_owner_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        DELETE FROM family_username_registry
        WHERE account_type = 'owner' AND account_id = OLD.id;
    END IF;

    INSERT INTO family_username_registry
        (username_key, family_id, account_type, account_id)
    VALUES
        (lower(trim(NEW.owner_username)), NEW.id, 'owner', NEW.id);

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION unregister_family_owner_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM family_username_registry
    WHERE account_type = 'owner' AND account_id = OLD.id;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION register_family_member_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        DELETE FROM family_username_registry
        WHERE account_type = 'member' AND account_id = OLD.id;
    END IF;

    INSERT INTO family_username_registry
        (username_key, family_id, account_type, account_id)
    VALUES
        (lower(trim(NEW.username)), NEW.family_id, 'member', NEW.id);

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION unregister_family_member_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM family_username_registry
    WHERE account_type = 'member' AND account_id = OLD.id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS family_owner_username_register ON family_accounts;
CREATE TRIGGER family_owner_username_register
AFTER INSERT OR UPDATE OF owner_username ON family_accounts
FOR EACH ROW EXECUTE FUNCTION register_family_owner_username();

DROP TRIGGER IF EXISTS family_owner_username_unregister ON family_accounts;
CREATE TRIGGER family_owner_username_unregister
AFTER DELETE ON family_accounts
FOR EACH ROW EXECUTE FUNCTION unregister_family_owner_username();

DROP TRIGGER IF EXISTS family_member_username_register ON family_members;
CREATE TRIGGER family_member_username_register
AFTER INSERT OR UPDATE OF username, family_id ON family_members
FOR EACH ROW EXECUTE FUNCTION register_family_member_username();

DROP TRIGGER IF EXISTS family_member_username_unregister ON family_members;
CREATE TRIGGER family_member_username_unregister
AFTER DELETE ON family_members
FOR EACH ROW EXECUTE FUNCTION unregister_family_member_username();

COMMIT;
