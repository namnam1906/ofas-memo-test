-- Per-user "memory" for pre-filling the form: default org name, saved
-- signers, and an address book of recipients — one JSON blob per user,
-- same pattern as documents.data (see 0001_init.sql). Keeping it as one
-- blob (rather than separate tables per list) avoids several migrations
-- for what's still a fairly small, all-read-together settings object.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     TEXT PRIMARY KEY,        -- Supabase auth user id (JWT sub)
  updated_at  TEXT NOT NULL,           -- ISO 8601
  data        TEXT NOT NULL            -- JSON blob: { orgName, signers: [...], addressBook: [...] }
);
