CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE authentication_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL DEFAULT 'gexor',
  normalized_email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (issuer, normalized_email)
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX sessions_account_status_idx ON sessions(account_id, revoked_at, expires_at);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  owner_account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,
  workspace_type TEXT NOT NULL CHECK (workspace_type = 'personal'),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role = 'owner'),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, account_id)
) STRICT;
CREATE INDEX memberships_account_scope_idx ON memberships(account_id, workspace_id, status);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, workspace_id)
) STRICT;
CREATE INDEX conversations_workspace_status_idx ON conversations(workspace_id, status, updated_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('accepted', 'complete', 'failed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, workspace_id),
  FOREIGN KEY (conversation_id, workspace_id) REFERENCES conversations(id, workspace_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX messages_workspace_conversation_idx ON messages(workspace_id, conversation_id, created_at);

CREATE TABLE runtime_executions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('accepted', 'preparing', 'dispatching', 'completed', 'failed', 'timed_out', 'cancelled')),
  provider TEXT,
  model TEXT,
  response_text TEXT,
  failure_code TEXT,
  failure_detail TEXT,
  failure_retryable INTEGER CHECK (failure_retryable IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (id, workspace_id),
  UNIQUE (message_id),
  FOREIGN KEY (conversation_id, workspace_id) REFERENCES conversations(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (message_id, workspace_id) REFERENCES messages(id, workspace_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX runtime_workspace_state_idx ON runtime_executions(workspace_id, state, updated_at);

CREATE TABLE idempotency_records (
  id TEXT PRIMARY KEY,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL REFERENCES runtime_executions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (actor_account_id, workspace_id, conversation_id, operation, idempotency_key)
) STRICT;

CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  payload_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT
) STRICT;
CREATE INDEX outbox_delivery_idx ON outbox_events(published_at, created_at);
