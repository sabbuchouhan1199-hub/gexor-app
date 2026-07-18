CREATE TABLE provider_catalog (
  provider_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE model_catalog (
  model_key TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL REFERENCES provider_catalog(provider_key) ON DELETE CASCADE,
  provider_model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_key, provider_model_id)
) STRICT;

CREATE TABLE provider_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES provider_catalog(provider_key) ON DELETE RESTRICT,
  credential_reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_validation', 'active', 'invalid', 'revoked')),
  created_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  validated_at TEXT,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE(id, workspace_id)
) STRICT;
CREATE INDEX provider_connections_workspace_idx ON provider_connections(workspace_id, status);

CREATE TABLE workspace_provider_selection (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  model_key TEXT NOT NULL REFERENCES model_catalog(model_key) ON DELETE RESTRICT,
  selected_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  selected_at TEXT NOT NULL,
  FOREIGN KEY(connection_id, workspace_id) REFERENCES provider_connections(id, workspace_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE provider_connection_audit (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('connected', 'validated', 'validation_failed', 'selected', 'revoked', 'credential_reference_rotated')),
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(connection_id, workspace_id) REFERENCES provider_connections(id, workspace_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX provider_audit_workspace_idx ON provider_connection_audit(workspace_id, created_at);

INSERT INTO provider_catalog(provider_key, display_name, status, created_at, updated_at)
VALUES ('ollama', 'Ollama', 'active', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z'),
       ('gemini', 'Google Gemini', 'active', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
INSERT INTO model_catalog(model_key, provider_key, provider_model_id, display_name, status, created_at, updated_at)
VALUES ('ollama:qwen3-0.6b', 'ollama', 'qwen3:0.6b', 'Qwen3 0.6B', 'active', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z'),
       ('gemini:flash-lite', 'gemini', 'gemini-3.1-flash-lite', 'Gemini Flash Lite', 'active', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
