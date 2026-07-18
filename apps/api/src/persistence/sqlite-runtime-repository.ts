import { randomUUID } from "node:crypto";

import type {
  ApiProblemCode,
  RuntimeExecutionResponse,
  RuntimeExecutionState,
} from "@gexor/contracts";
import {
  InvalidRuntimeTransitionError,
  type RuntimeExecutionStore,
  type TransitionOutcome,
} from "../runtime-execution-store.js";
import { SqliteDatabase } from "./database.js";

const transitions: Readonly<Record<RuntimeExecutionState, readonly RuntimeExecutionState[]>> = {
  accepted: ['preparing', 'cancelled'],
  preparing: ["dispatching", 'cancelled', 'failed'],
  dispatching: ['completed', 'failed', 'timed_out', 'cancelled'],
  completed: [], failed: [], timed_out: [], cancelled: [],
};
const terminalStates = new Set<RuntimeExecutionState>(['completed', 'failed', 'timed_out', 'cancelled']);

type ExecutionRow = {
  id: string; workspace_id: string; conversation_id: string; message_id: string;
  requested_by: string; request_id: string; state: RuntimeExecutionState;
  provider: string | null; model: string | null; response_text: string | null;
  failure_code: ApiProblemCode | null; failure_detail: string | null;
  failure_retryable: number | null; created_at: string; updated_at: string;
  started_at: string | null; completed_at: string | null;
};

export class SqliteRuntimeExecutionStore implements RuntimeExecutionStore {
  readonly #database: SqliteDatabase;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(database: SqliteDatabase, options: { now?: () => Date; createId?: () => string } = {}) {
    this.#database = database;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  create(): RuntimeExecutionResponse {
    throw new Error("Persistent executions require atomic message acceptance.");
  }

  get(executionId: string): RuntimeExecutionResponse | undefined {
    const row = this.#database.prepare("SELECT * FROM runtime_executions WHERE id = ?").get(executionId) as ExecutionRow | undefined;
    return row ? executionSnapshot(row) : undefined;
  }

  transition(
    executionId: string,
    nextState: RuntimeExecutionState,
    outcome: TransitionOutcome = {},
  ): RuntimeExecutionResponse | undefined {
    const current = this.get(executionId);
    if (!current) return undefined;
    if (!transitions[current.state].includes(nextState)) {
      throw new InvalidRuntimeTransitionError(current.state, nextState);
    }
    assertOutcome(nextState, outcome);
    const timestamp = this.#now().toISOString();
    this.#database.transaction(() => {
      const result = this.#database.prepare(`
        UPDATE runtime_executions SET
          state = ?, updated_at = ?,
          started_at = CASE WHEN ? = 'preparing' THEN ? ELSE started_at END,
          completed_at = CASE WHEN ? IN ('completed', 'failed', 'timed_out', 'cancelled') THEN ? ELSE completed_at END,
          provider = COALESCE(?, provider), model = COALESCE(?, model),
          response_text = CASE WHEN ? = 'completed' THEN ? ELSE response_text END,
          failure_code = CASE WHEN ? IN ('failed', 'timed_out') THEN ? ELSE failure_code END,
          failure_detail = CASE WHEN ? IN ('failed', 'timed_out') THEN ? ELSE failure_detail END,
          failure_retryable = CASE WHEN ? IN ('failed', 'timed_out') THEN ? ELSE failure_retryable END,
          version = version + 1
        WHERE id = ? AND state = ?
      `).run(
        nextState, timestamp, nextState, timestamp, nextState, timestamp,
        outcome.provider ?? null, outcome.model ?? null,
        nextState, outcome.response?.text ?? null,
        nextState, outcome.failure?.code ?? null,
        nextState, outcome.failure?.detail ?? null,
        nextState, outcome.failure ? Number(outcome.failure.retryable) : null,
        executionId, current.state,
      );
      if (result.changes !== 1n && result.changes !== 1) {
        throw new InvalidRuntimeTransitionError(current.state, nextState);
      }
      if (terminalStates.has(nextState)) {
        const messageState = nextState === 'completed' ? "complete" : nextState === 'cancelled' ? 'cancelled' : 'failed';
        this.#database.prepare("UPDATE messages SET state = ?, updated_at = ? WHERE id = ?").run(
          messageState, timestamp, current.messageId,
        );
        this.#database.prepare(`
          INSERT INTO outbox_events(
            id, workspace_id, aggregate_type, aggregate_id, event_type,
            schema_version, payload_json, correlation_id, created_at
          ) VALUES (?, ?, 'runtime_execution', ?, ?, 1, ?, ?, ?)
        `).run(
          `event_${this.#createId()}`,
          current.workspaceId!,
          executionId,
          `execution.${nextState}`,
          JSON.stringify({ executionId, state: nextState }),
          current.requestId,
          timestamp,
        );
      }
    });
    return this.get(executionId);
  }
}

export type MessageAcceptanceInput = {
  actorUserId: string;
  workspaceId: string;
  conversationId: string;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  text: string;
};

export type MessageAcceptanceResult =
  | { outcome: 'accepted'; execution: RuntimeExecutionResponse }
  | { outcome: "replayed"; execution: RuntimeExecutionResponse }
  | { outcome: "conflict" }
  | { outcome: "conversation_not_found" };

export interface MessageAcceptanceRepository {
  accept(input: MessageAcceptanceInput): Promise<MessageAcceptanceResult>;
}

export class SqliteMessageAcceptanceRepository implements MessageAcceptanceRepository {
  readonly #database: SqliteDatabase;
  readonly #store: SqliteRuntimeExecutionStore;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(
    database: SqliteDatabase,
    store: SqliteRuntimeExecutionStore,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.#database = database;
    this.#store = store;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async accept(input: MessageAcceptanceInput): Promise<MessageAcceptanceResult> {
    const conversation = this.#database.prepare(`
      SELECT id FROM conversations WHERE id = ? AND workspace_id = ? AND status = 'active'
    `).get(input.conversationId, input.workspaceId);
    if (!conversation) return { outcome: "conversation_not_found" };

    return this.#database.transaction(() => {
      const existing = this.#database.prepare(`
        SELECT request_hash, execution_id FROM idempotency_records
        WHERE actor_account_id = ? AND workspace_id = ? AND conversation_id = ?
          AND operation = 'message.accept' AND idempotency_key = ?
      `).get(
        input.actorUserId, input.workspaceId, input.conversationId, input.idempotencyKey,
      ) as { request_hash: string; execution_id: string } | undefined;
      if (existing) {
        if (existing.request_hash !== input.requestHash) return { outcome: "conflict" };
        const execution = this.#store.get(existing.execution_id);
        if (!execution) throw new Error("Idempotency record references a missing execution.");
        return { outcome: "replayed", execution };
      }

      const timestamp = this.#now().toISOString();
      const messageId = `message_${this.#createId()}`;
      const executionId = `execution_${this.#createId()}`;
      this.#database.prepare(`
        INSERT INTO messages(id, workspace_id, conversation_id, actor_account_id, role, content_text, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'user', ?, 'accepted', ?, ?)
      `).run(messageId, input.workspaceId, input.conversationId, input.actorUserId, input.text, timestamp, timestamp);
      this.#database.prepare(`
        INSERT INTO runtime_executions(
          id, workspace_id, conversation_id, message_id, requested_by, request_id,
          state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, ?)
      `).run(
        executionId, input.workspaceId, input.conversationId, messageId,
        input.actorUserId, input.requestId, timestamp, timestamp,
      );
      this.#database.prepare(`
        INSERT INTO idempotency_records(
          id, actor_account_id, workspace_id, conversation_id, operation,
          idempotency_key, request_hash, message_id, execution_id, created_at
        ) VALUES (?, ?, ?, ?, 'message.accept', ?, ?, ?, ?, ?)
      `).run(
        `idempotency_${this.#createId()}`, input.actorUserId, input.workspaceId,
        input.conversationId, input.idempotencyKey, input.requestHash,
        messageId, executionId, timestamp,
      );
      this.#database.prepare(`
        INSERT INTO outbox_events(
          id, workspace_id, aggregate_type, aggregate_id, event_type,
          schema_version, payload_json, correlation_id, created_at
        ) VALUES (?, ?, 'runtime_execution', ?, 'message.accepted', 1, ?, ?, ?)
      `).run(
        `event_${this.#createId()}`, input.workspaceId, executionId,
        JSON.stringify({ executionId, messageId, conversationId: input.conversationId }),
        input.requestId, timestamp,
      );
      return { outcome: 'accepted', execution: this.#store.get(executionId)! };
    });
  }
}

function executionSnapshot(row: ExecutionRow): RuntimeExecutionResponse {
  return {
    executionId: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    requestId: row.request_id,
    workspaceId: row.workspace_id,
    requestedBy: row.requested_by,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.response_text ? { response: { text: row.response_text } } : {}),
    ...(row.failure_code && row.failure_detail ? {
      failure: {
        code: row.failure_code,
        detail: row.failure_detail,
        retryable: Boolean(row.failure_retryable),
      },
    } : {}),
    links: { self: `/api/v1/executions/${row.id}` },
  };
}

function assertOutcome(nextState: RuntimeExecutionState, outcome: TransitionOutcome): void {
  if (nextState === 'completed' && !outcome.response) {
    throw new Error("Completed runtime execution requires a response.");
  }
  if ((nextState === 'failed' || nextState === 'timed_out') && !outcome.failure) {
    throw new Error(`${nextState} runtime execution requires a failure.`);
  }
  if (
    nextState !== 'completed' && nextState !== 'failed' && nextState !== 'timed_out'
    && (outcome.response || outcome.failure)
  ) {
    throw new Error("Non-terminal transition cannot record an outcome.");
  }
}
