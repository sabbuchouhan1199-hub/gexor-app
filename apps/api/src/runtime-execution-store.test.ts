import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InMemoryRuntimeExecutionStore,
  InvalidRuntimeTransitionError,
} from "./runtime-execution-store.js";

test("runtime executions follow valid timestamped transitions", () => {
  let tick = 0;
  const store = new InMemoryRuntimeExecutionStore({
    createId: (() => {
      const ids = ["execution", "message"];
      return () => ids.shift() ?? "extra";
    })(),
    now: () => new Date(tick++ * 1000),
  });
  const created = store.create("conv_1");
  assert.equal(created.state, "created");
  assert.equal(created.id, "exec_execution");
  assert.equal(created.messageId, "msg_message");

  const validating = store.transition(created.id, "validating");
  const preparing = store.transition(created.id, "preparing");
  assert.equal(validating?.state, "validating");
  assert.equal(preparing?.state, "preparing");
  assert.notEqual(preparing?.updatedAt, created.updatedAt);
});

test("duplicate transitions are idempotent", () => {
  const store = new InMemoryRuntimeExecutionStore();
  const execution = store.create("conv_1");
  const first = store.transition(execution.id, "validating");
  const duplicate = store.transition(execution.id, "validating");
  assert.deepEqual(duplicate, first);
});

test("invalid transitions fail closed", () => {
  const store = new InMemoryRuntimeExecutionStore();
  const execution = store.create("conv_1");
  assert.throws(
    () => store.transition(execution.id, "completed"),
    InvalidRuntimeTransitionError,
  );
  assert.equal(store.get(execution.id)?.state, "created");
});

test("terminal executions cannot be reactivated", () => {
  const store = new InMemoryRuntimeExecutionStore();
  const execution = store.create("conv_1");
  store.transition(execution.id, "validating");
  store.transition(execution.id, "failed");
  assert.throws(
    () => store.transition(execution.id, "validating"),
    InvalidRuntimeTransitionError,
  );
});

test("store reads return defensive copies", () => {
  const store = new InMemoryRuntimeExecutionStore();
  const execution = store.create("conv_1");
  execution.state = "completed";
  assert.equal(store.get(execution.id)?.state, "created");
});
