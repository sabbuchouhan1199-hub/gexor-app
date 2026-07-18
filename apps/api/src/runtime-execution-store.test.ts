import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InMemoryRuntimeExecutionStore,
  InvalidRuntimeTransitionError,
} from "./runtime-execution-store.js";

function deterministicStore() {
  let tick = 0;
  const ids = ["execution", "message"];
  return new InMemoryRuntimeExecutionStore({
    createId: () => ids.shift() ?? "extra",
    now: () => new Date(tick++ * 1000),
  });
}

function acceptedExecution(store = deterministicStore()) {
  return {
    store,
    execution: store.create({
      conversationId: "conv_1",
      requestId: "req_1",
    }),
  };
}

test("accepted snapshots contain correlation and no premature outcome fields", () => {
  const { execution } = acceptedExecution();
  assert.deepEqual(execution, {
    executionId: "exec_execution",
    messageId: "msg_message",
    conversationId: "conv_1",
    requestId: "req_1",
    state: "accepted",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    links: { self: "/api/v1/executions/exec_execution" },
  });
});

test("successful execution records lifecycle timestamps and provider-neutral response", () => {
  const { store, execution } = acceptedExecution();
  const preparing = store.transition(execution.executionId, "preparing")!;
  store.transition(execution.executionId, "dispatching");
  const completed = store.transition(execution.executionId, "completed", {
    provider: "fake",
    model: "fake-model",
    response: { text: "Safe response" },
  })!;

  assert.equal(preparing.startedAt, preparing.updatedAt);
  assert.equal(completed.state, "completed");
  assert.equal(completed.completedAt, completed.updatedAt);
  assert.equal(completed.provider, "fake");
  assert.equal(completed.model, "fake-model");
  assert.deepEqual(completed.response, { text: "Safe response" });
  assert.equal(completed.failure, undefined);
});

for (const terminalState of ["failed", "timed_out"] as const) {
  test(`${terminalState} execution records only a safe failure`, () => {
    const { store, execution } = acceptedExecution();
    store.transition(execution.executionId, "preparing");
    store.transition(execution.executionId, "dispatching");
    const terminal = store.transition(execution.executionId, terminalState, {
      failure: {
        code: terminalState === "timed_out" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
        detail: "Controlled detail.",
        retryable: true,
      },
    })!;

    assert.equal(terminal.state, terminalState);
    assert.equal(terminal.completedAt, terminal.updatedAt);
    assert.deepEqual(terminal.failure, {
      code: terminalState === "timed_out" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
      detail: "Controlled detail.",
      retryable: true,
    });
    assert.equal(terminal.response, undefined);
  });
}

test("all specified cancellation transitions are legal", () => {
  for (const precedingStates of [
    [] as const,
    ["preparing"] as const,
    ["preparing", "dispatching"] as const,
  ]) {
    const { store, execution } = acceptedExecution();
    for (const state of precedingStates) store.transition(execution.executionId, state);
    const cancelled = store.transition(execution.executionId, "cancelled")!;
    assert.equal(cancelled.completedAt, cancelled.updatedAt);
  }
});

test("illegal, repeated, and terminal transitions throw deterministic domain errors", () => {
  const { store, execution } = acceptedExecution();
  assert.throws(
    () => store.transition(execution.executionId, "completed", {
      response: { text: "invalid" },
    }),
    {
      name: "InvalidRuntimeTransitionError",
      message: "Cannot transition runtime execution from accepted to completed.",
    },
  );
  assert.throws(
    () => store.transition(execution.executionId, "accepted"),
    InvalidRuntimeTransitionError,
  );

  store.transition(execution.executionId, "cancelled");
  assert.throws(
    () => store.transition(execution.executionId, "cancelled"),
    InvalidRuntimeTransitionError,
  );
  assert.throws(
    () => store.transition(execution.executionId, "preparing"),
    InvalidRuntimeTransitionError,
  );
});

test("terminal outcomes are required and rejected on non-terminal states", () => {
  const { store, execution } = acceptedExecution();
  store.transition(execution.executionId, "preparing");
  store.transition(execution.executionId, "dispatching");
  assert.throws(
    () => store.transition(execution.executionId, "completed"),
    /requires a response/,
  );

  const second = acceptedExecution();
  assert.throws(
    () => second.store.transition(second.execution.executionId, "preparing", {
      response: { text: "too early" },
    }),
    /cannot record an outcome/,
  );
});

test("store reads return defensive copies", () => {
  const { store, execution } = acceptedExecution();
  execution.state = "completed";
  assert.equal(store.get(execution.executionId)?.state, "accepted");
});
