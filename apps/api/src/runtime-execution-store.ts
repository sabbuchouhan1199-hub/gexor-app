import { randomUUID } from "node:crypto";

import type {
  RuntimeExecutionFailure,
  RuntimeExecutionResponse,
  RuntimeExecutionState,
} from "@gexor/contracts";

const terminalStates = new Set<RuntimeExecutionState>([
  "completed",
  "failed",
  "timed_out",
  "cancelled",
]);

const transitions: Readonly<Record<RuntimeExecutionState, readonly RuntimeExecutionState[]>> = {
  accepted: ["preparing", "cancelled"],
  preparing: ["dispatching", "cancelled", "failed"],
  dispatching: ["completed", "failed", "timed_out", "cancelled"],
  completed: [],
  failed: [],
  timed_out: [],
  cancelled: [],
};

export type TransitionOutcome = {
  provider?: string;
  model?: string;
  response?: { text: string };
  failure?: RuntimeExecutionFailure;
};

export class InvalidRuntimeTransitionError extends Error {
  constructor(currentState: RuntimeExecutionState, nextState: RuntimeExecutionState) {
    super(`Cannot transition runtime execution from ${currentState} to ${nextState}.`);
    this.name = "InvalidRuntimeTransitionError";
  }
}

export interface RuntimeExecutionStore {
  create(options: {
    conversationId: string;
    requestId: string;
    workspaceId?: string;
    requestedBy?: string;
  }): RuntimeExecutionResponse;
  get(executionId: string): RuntimeExecutionResponse | undefined;
  transition(
    executionId: string,
    nextState: RuntimeExecutionState,
    outcome?: TransitionOutcome,
  ): RuntimeExecutionResponse | undefined;
}

export class InMemoryRuntimeExecutionStore implements RuntimeExecutionStore {
  readonly #executions = new Map<string, RuntimeExecutionResponse>();
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: { now?: () => Date; createId?: () => string } = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  create(options: {
    conversationId: string;
    requestId: string;
    workspaceId?: string;
    requestedBy?: string;
  }): RuntimeExecutionResponse {
    const executionId = `exec_${this.#createId()}`;
    const messageId = `msg_${this.#createId()}`;
    const timestamp = this.#now().toISOString();
    const execution: RuntimeExecutionResponse = {
      executionId,
      messageId,
      conversationId: options.conversationId,
      requestId: options.requestId,
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(options.requestedBy ? { requestedBy: options.requestedBy } : {}),
      state: "accepted",
      createdAt: timestamp,
      updatedAt: timestamp,
      links: { self: `/api/v1/executions/${executionId}` },
    };
    this.#executions.set(executionId, execution);
    return structuredClone(execution);
  }

  get(executionId: string): RuntimeExecutionResponse | undefined {
    const execution = this.#executions.get(executionId);
    return execution ? structuredClone(execution) : undefined;
  }

  transition(
    executionId: string,
    nextState: RuntimeExecutionState,
    outcome: TransitionOutcome = {},
  ): RuntimeExecutionResponse | undefined {
    const execution = this.#executions.get(executionId);
    if (!execution) return undefined;

    if (!transitions[execution.state].includes(nextState)) {
      throw new InvalidRuntimeTransitionError(execution.state, nextState);
    }

    this.#assertOutcome(nextState, outcome);
    const timestamp = this.#now().toISOString();
    execution.state = nextState;
    execution.updatedAt = timestamp;

    if (nextState === "preparing") execution.startedAt = timestamp;
    if (outcome.provider !== undefined) execution.provider = outcome.provider;
    if (outcome.model !== undefined) execution.model = outcome.model;
    if (nextState === "completed") execution.response = outcome.response;
    if (nextState === "failed" || nextState === "timed_out") {
      execution.failure = outcome.failure;
    }
    if (terminalStates.has(nextState)) execution.completedAt = timestamp;

    return structuredClone(execution);
  }

  #assertOutcome(nextState: RuntimeExecutionState, outcome: TransitionOutcome): void {
    if (nextState === "completed" && outcome.response === undefined) {
      throw new Error("Completed runtime execution requires a response.");
    }
    if (
      (nextState === "failed" || nextState === "timed_out")
      && outcome.failure === undefined
    ) {
      throw new Error(`${nextState} runtime execution requires a failure.`);
    }
    if (
      nextState !== "completed"
      && nextState !== "failed"
      && nextState !== "timed_out"
      && (outcome.response !== undefined || outcome.failure !== undefined)
    ) {
      throw new Error("Non-terminal transition cannot record an outcome.");
    }
  }
}
