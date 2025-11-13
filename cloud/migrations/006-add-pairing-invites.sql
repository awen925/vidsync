-- Migration 006: add pairing_invites table for short-lived pairing tokens

BEGIN;

CREATE TABLE IF NOT EXISTS pairing_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  project_id uuid NOT NULL,
  from_device_id text NOT NULL,
  acceptor_device_id text NULL,
  consumed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS pairing_invites_token_idx ON pairing_invites (token);
CREATE INDEX IF NOT EXISTS pairing_invites_project_idx ON pairing_invites (project_id);

COMMIT;
