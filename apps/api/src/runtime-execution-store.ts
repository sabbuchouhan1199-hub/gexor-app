import { randomUUID } from "node:crypto";

import type { RuntimeExecutionResponse, RuntimeExecutionState } from "@gexor/contracts";

const transitions: Readonly<Record<RuntimeExecutionState, readonly RuntimeExecutionState[]>> = {
  created: ["validating"],
  validating: ["preparing", "failed"],
  preparing: ["provider_pending", "failed", "cancelled"],
  provider_pending: ["streaming", "finalizing", "failed", "cancellation_requested", "cancelled"],
  streaming: ["finalizing", "failed", "cancellation_requested", "cancelled"],
  finalizing: ["completed", "reconciliation_pending", "failed"],
  reconciliation_pending: ["completed", "failed"],
  cancellation_requested: ["cancelled", "completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export type RuntimeExecution = RuntimeExecutionResponse;

export class InvalidRuntimeTransitionError extends Error {}

export class InMemoryRuntimeExecutionStore {
  readonly #executions = new Map<string, RuntimeExecution>();
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: { now?: () => Date; createId?: () => string } = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  create(conversationId: string): RuntimeExecution {
    const executionId = `exec_${this.#createId()}`;
    const messageId = `msg_${this.#createId()}`;
    const timestamp = this.#now().toISOString();
    const execution: RuntimeExecution = {
      id: executionId,
      conversationId,
      messageId,
      state: "created",
      createdAt: timestamp,
      updatedAt: timestamp,
      links: { self: `/api/v1/executions/${executionId}` },
    };
    this.#executions.set(executionId, execution);
    return structuredClone(execution);
  }

  get(executionId: string): RuntimeExecution | undefined {
    const execution = this.#executions.get(executionId);
    return execution ? structuredClone(execution) : undefined;
  }

  transition(executionId: string, nextState: RuntimeExecutionState): RuntimeExecution | undefined {
    const execution = this.#executions.get(executionId);
    if (!execution) return undefined;
    if (execution.state === nextState) return structuredClone(execution);
    if (!transitions[execution.state].includes(nextState)) {
      throw new InvalidRuntimeTransitionError(
        `Cannot transition runtime execution from ${execution.state} to ${nextState}.`,
      );
    }
    execution.state = nextState;
    execution.updatedAt = this.#now().toISOString();
    return structuredClone(execution);
  }
}
