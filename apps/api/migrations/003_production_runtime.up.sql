CREATE TABLE execution_events (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES runtime_executions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'execution.snapshot', 'execution.started', 'response.delta',
    'response.completed', 'execution.cancelled', 'execution.failed',
    'execution.timed_out', 'heartbeat'
  )),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (execution_id, sequence)
) STRICT;
CREATE INDEX execution_events_replay_idx ON execution_events(execution_id, sequence);
CREATE INDEX execution_events_retention_idx ON execution_events(created_at);
CREATE UNIQUE INDEX execution_events_terminal_idx ON execution_events(execution_id)
  WHERE event_type IN ('response.completed', 'execution.cancelled', 'execution.failed', 'execution.timed_out');

CREATE TABLE execution_jobs (
  execution_id TEXT PRIMARY KEY REFERENCES runtime_executions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN (
    'queued', 'leased', 'retry_wait', 'cancel_requested',
    'completed', 'cancelled', 'dead_letter'
  )),
  available_at TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX execution_jobs_claim_idx ON execution_jobs(state, available_at, lease_expires_at);
CREATE INDEX execution_jobs_workspace_idx ON execution_jobs(workspace_id, state, updated_at);

CREATE TABLE execution_relationships (
  execution_id TEXT PRIMARY KEY REFERENCES runtime_executions(id) ON DELETE CASCADE,
  source_execution_id TEXT REFERENCES runtime_executions(id) ON DELETE SET NULL,
  source_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('initial', 'retry', 'regenerate')),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX execution_relationship_source_idx ON execution_relationships(source_execution_id, relationship);

CREATE TABLE provider_routing (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  model_key TEXT REFERENCES model_catalog(model_key) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  health_state TEXT NOT NULL DEFAULT 'unknown' CHECK (health_state IN ('unknown', 'healthy', 'degraded', 'unhealthy', 'disabled')),
  last_checked_at TEXT,
  safe_failure_code TEXT,
  safe_failure_message TEXT,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, connection_id),
  FOREIGN KEY (connection_id, workspace_id) REFERENCES provider_connections(id, workspace_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX provider_routing_selection_idx ON provider_routing(workspace_id, enabled, health_state, priority);
CREATE INDEX conversations_title_search_idx ON conversations(workspace_id, title, updated_at);
CREATE INDEX messages_text_search_idx ON messages(workspace_id, conversation_id, content_text, created_at);
CREATE UNIQUE INDEX provider_routing_default_idx ON provider_routing(workspace_id) WHERE is_default = 1;

CREATE TRIGGER provider_routing_connection_insert AFTER INSERT ON provider_connections BEGIN
  INSERT INTO provider_routing(workspace_id, connection_id, priority, enabled, is_default, health_state, updated_at)
  VALUES (NEW.workspace_id, NEW.id, 100, 1, 0, 'unknown', NEW.updated_at);
END;
CREATE TRIGGER provider_routing_selection_insert AFTER INSERT ON workspace_provider_selection BEGIN
  UPDATE provider_routing SET is_default=0, updated_at=NEW.selected_at WHERE workspace_id=NEW.workspace_id;
  UPDATE provider_routing SET is_default=1, model_key=NEW.model_key, updated_at=NEW.selected_at
    WHERE workspace_id=NEW.workspace_id AND connection_id=NEW.connection_id;
END;
CREATE TRIGGER provider_routing_selection_update AFTER UPDATE ON workspace_provider_selection BEGIN
  UPDATE provider_routing SET is_default=0, updated_at=NEW.selected_at WHERE workspace_id=NEW.workspace_id;
  UPDATE provider_routing SET is_default=1, model_key=NEW.model_key, updated_at=NEW.selected_at
    WHERE workspace_id=NEW.workspace_id AND connection_id=NEW.connection_id;
END;
CREATE TRIGGER provider_routing_connection_status AFTER UPDATE OF status ON provider_connections BEGIN
  UPDATE provider_routing SET enabled=CASE WHEN NEW.status='active' THEN enabled ELSE 0 END,
    health_state=CASE WHEN NEW.status='active' THEN health_state ELSE 'disabled' END,
    is_default=CASE WHEN NEW.status='active' THEN is_default ELSE 0 END, updated_at=NEW.updated_at
    WHERE workspace_id=NEW.workspace_id AND connection_id=NEW.id;
END;
INSERT INTO provider_routing(workspace_id, connection_id, model_key, priority, enabled, is_default, health_state, updated_at)
SELECT pc.workspace_id, pc.id, s.model_key, 100,
       CASE WHEN pc.status='active' THEN 1 ELSE 0 END,
       CASE WHEN s.connection_id IS NOT NULL THEN 1 ELSE 0 END,
       CASE WHEN pc.status='active' THEN 'unknown' ELSE 'disabled' END,
       pc.updated_at
FROM provider_connections pc
LEFT JOIN workspace_provider_selection s ON s.workspace_id=pc.workspace_id AND s.connection_id=pc.id;

CREATE TABLE provider_attempts (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES runtime_executions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  connection_id TEXT,
  provider_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('started', 'completed', 'failed', 'cancelled')),
  failure_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (execution_id, attempt_number)
) STRICT;
CREATE INDEX provider_attempts_execution_idx ON provider_attempts(execution_id, attempt_number);

CREATE TABLE pricing_versions (
  id TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  source_metadata TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE pricing_rates (
  pricing_version_id TEXT NOT NULL REFERENCES pricing_versions(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_micros_per_million INTEGER NOT NULL CHECK (input_micros_per_million >= 0),
  output_micros_per_million INTEGER NOT NULL CHECK (output_micros_per_million >= 0),
  PRIMARY KEY (pricing_version_id, provider_key, model_id)
) STRICT;

CREATE TABLE usage_records (
  execution_id TEXT PRIMARY KEY REFERENCES runtime_executions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  provider_key TEXT,
  model_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'timed_out', 'cancelled')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  usage_class TEXT NOT NULL CHECK (usage_class IN ('measured', 'estimated', 'unavailable')),
  cost_micros INTEGER CHECK (cost_micros IS NULL OR cost_micros >= 0),
  currency TEXT,
  pricing_version_id TEXT REFERENCES pricing_versions(id) ON DELETE RESTRICT,
  calculation_method TEXT NOT NULL,
  fallback_attempts INTEGER NOT NULL DEFAULT 0 CHECK (fallback_attempts >= 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX usage_workspace_time_idx ON usage_records(workspace_id, created_at);
CREATE INDEX usage_provider_model_idx ON usage_records(workspace_id, provider_key, model_id, created_at);
CREATE INDEX usage_outcome_idx ON usage_records(workspace_id, outcome, created_at);

CREATE TABLE workspace_budgets (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  request_limit INTEGER CHECK (request_limit IS NULL OR request_limit > 0),
  token_limit INTEGER CHECK (token_limit IS NULL OR token_limit > 0),
  cost_limit_micros INTEGER CHECK (cost_limit_micros IS NULL OR cost_limit_micros > 0),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (period_end > period_start)
) STRICT;

CREATE TABLE conversation_deletions (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deleted_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  deleted_at TEXT NOT NULL
) STRICT;

CREATE TABLE file_attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  extraction_state TEXT NOT NULL CHECK (extraction_state IN ('pending', 'processing', 'ready', 'failed')),
  safe_failure_code TEXT,
  extraction_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id, workspace_id) REFERENCES conversations(id, workspace_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX file_attachments_owner_idx ON file_attachments(workspace_id, conversation_id, created_at);
CREATE INDEX file_attachments_extraction_idx ON file_attachments(extraction_state, updated_at);

CREATE TABLE file_chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES file_attachments(id) ON DELETE CASCADE,
  chunk_order INTEGER NOT NULL CHECK (chunk_order >= 0),
  section_label TEXT,
  content_text TEXT NOT NULL,
  extraction_version TEXT NOT NULL,
  UNIQUE (file_id, chunk_order)
) STRICT;
CREATE INDEX file_chunks_file_idx ON file_chunks(file_id, chunk_order);

INSERT INTO pricing_versions(id, currency, effective_at, source_metadata, created_at)
VALUES ('pricing_unpriced_v1', 'USD', '2026-07-18T00:00:00.000Z',
        'No monetary rates configured; usage remains reproducible and explicitly estimated.',
        '2026-07-18T00:00:00.000Z');
