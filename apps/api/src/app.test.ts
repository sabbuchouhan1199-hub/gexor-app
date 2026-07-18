import assert from "node:assert/strict";
import { after, test } from "node:test";

import type {
  ApiProblem,
  RuntimeExecutionResponse,
} from "@gexor/contracts";
import { buildApp } from "./app.js";
import { ProviderError } from "./providers/errors.js";
import type {
  GenerateTextResult,
  TextProvider,
} from "./providers/provider.js";
import { InMemoryRuntimeExecutionStore } from "./runtime-execution-store.js";

let providerCallCount = 0;
const textProvider: TextProvider = {
  async generateText(request) {
    providerCallCount += 1;
    return { provider: "fake", model: "fake-model", text: request.input };
  },
};
const app = buildApp({ textProvider });

after(async () => app.close());

function assertProblem(
  response: { statusCode: number; headers: Record<string, unknown>; json(): unknown },
  expected: { status: number; code: ApiProblem["code"]; retryable: boolean; detail?: string },
): ApiProblem {
  assert.equal(response.statusCode, expected.status);
  assert.match(String(response.headers["content-type"]), /^application\/problem\+json/);
  const body = response.json() as ApiProblem;
  assert.equal(body.status, expected.status);
  assert.equal(body.code, expected.code);
  assert.equal(body.retryable, expected.retryable);
  assert.equal(body.requestId, response.headers["x-request-id"]);
  assert.match(body.type, /^https:\/\/docs\.gexor\/errors\//);
  if (expected.detail !== undefined) assert.equal(body.detail, expected.detail);
  return body;
}

async function waitForState(
  targetApp: ReturnType<typeof buildApp>,
  executionUrl: string,
  state: RuntimeExecutionResponse["state"],
): Promise<RuntimeExecutionResponse> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await targetApp.inject({ method: "GET", url: executionUrl });
    const snapshot = response.json() as RuntimeExecutionResponse;
    if (snapshot.state === state) return snapshot;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Execution did not reach ${state}.`);
}

for (const url of ["/health", "/api/v1/health"]) {
  test(`GET ${url} returns correlated health`, async () => {
    const response = await app.inject({
      method: "GET",
      url,
      headers: { "x-request-id": "health-request" },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
    assert.equal(response.headers["x-request-id"], "health-request");
  });
}

test("unsafe request IDs are replaced", async () => {
  const response = await app.inject({
    method: "GET", url: "/api/v1/health",
    headers: { "x-request-id": "unsafe id\nvalue" },
  });
  assert.match(String(response.headers["x-request-id"]), /^req_/);
});

test("POST /mock/chat remains deterministic", async () => {
  const callsBefore = providerCallCount;
  const response = await app.inject({
    method: "POST", url: "/mock/chat", payload: { message: "  Hello Gexor  " },
  });
  assert.deepEqual(response.json(), { reply: "Mock reply: Hello Gexor" });
  assert.equal(providerCallCount, callsBefore);
});

test("message submission requires exactly one text item", async () => {
  for (const content of [
    [],
    [{ type: "text", text: "one" }, { type: "text", text: "two" }],
    [{ type: "text", text: "   " }],
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/conversations/conv_123/messages",
      payload: { content },
    });
    assertProblem(response, {
      status: 400, code: "VALIDATION_ERROR", retryable: false,
    });
  }
});

test("canonical submission returns accepted then progresses asynchronously to completed", async () => {
  let resolveProvider!: (value: GenerateTextResult) => void;
  const providerResult = new Promise<GenerateTextResult>((resolve) => {
    resolveProvider = resolve;
  });
  const runtimeApp = buildApp({
    textProvider: { async generateText() { return providerResult; } },
  });

  try {
    const response = await runtimeApp.inject({
      method: "POST",
      url: "/api/v1/conversations/conv_123/messages",
      headers: { "x-request-id": "request-123" },
      payload: { content: [{ type: "text", text: "Hello Gexor" }] },
    });
    assert.equal(response.statusCode, 202);
    const accepted = response.json();
    assert.equal(accepted.state, "accepted");
    assert.equal(accepted.requestId, "request-123");

    const dispatching = await waitForState(
      runtimeApp,
      accepted.links.execution,
      "dispatching",
    );
    assert.equal(dispatching.requestId, "request-123");
    assert.equal(dispatching.startedAt !== undefined, true);
    assert.equal(dispatching.response, undefined);
    assert.equal(dispatching.failure, undefined);

    resolveProvider({
      provider: "fake-provider",
      model: "fake-model",
      text: "Completed response",
    });
    const completed = await waitForState(
      runtimeApp,
      accepted.links.execution,
      "completed",
    );
    assert.equal(completed.executionId, accepted.executionId);
    assert.equal(completed.messageId, accepted.messageId);
    assert.equal(completed.conversationId, "conv_123");
    assert.equal(completed.provider, "fake-provider");
    assert.equal(completed.model, "fake-model");
    assert.deepEqual(completed.response, { text: "Completed response" });
    assert.equal(completed.completedAt, completed.updatedAt);
    assert.equal(completed.failure, undefined);
  } finally {
    await runtimeApp.close();
  }
});

test("asynchronous provider failures become safe failed snapshots", async () => {
  const privateMessage = "provider secret payload";
  const runtimeApp = buildApp({
    textProvider: {
      async generateText() {
        throw new ProviderError({
          code: "PROVIDER_REQUEST_REJECTED",
          message: privateMessage,
          status: 502,
          retryable: false,
        });
      },
    },
  });

  try {
    const response = await runtimeApp.inject({
      method: "POST",
      url: "/api/v1/conversations/conv_123/messages",
      payload: { content: [{ type: "text", text: "Hello" }] },
    });
    const accepted = response.json();
    const failed = await waitForState(runtimeApp, accepted.links.execution, "failed");
    assert.deepEqual(failed.failure, {
      code: "PROVIDER_REQUEST_REJECTED",
      detail: "The provider rejected the request.",
      retryable: false,
    });
    assert.equal(JSON.stringify(failed).includes(privateMessage), false);
    assert.equal(failed.response, undefined);
  } finally {
    await runtimeApp.close();
  }
});

test("provider timeouts become timed_out snapshots", async () => {
  const runtimeApp = buildApp({
    textProvider: {
      async generateText() {
        throw new ProviderError({
          code: "PROVIDER_TIMEOUT",
          message: "private timeout",
          status: 504,
          retryable: true,
        });
      },
    },
  });

  try {
    const response = await runtimeApp.inject({
      method: "POST",
      url: "/api/v1/conversations/conv_123/messages",
      payload: { content: [{ type: "text", text: "Hello" }] },
    });
    const accepted = response.json();
    const timedOut = await waitForState(runtimeApp, accepted.links.execution, "timed_out");
    assert.equal(timedOut.failure?.code, "PROVIDER_TIMEOUT");
    assert.equal(timedOut.failure?.retryable, true);
  } finally {
    await runtimeApp.close();
  }
});

test("POST /chat uses the shared runtime executor", async () => {
  const ids = ["chat-execution", "chat-message"];
  const store = new InMemoryRuntimeExecutionStore({
    createId: () => ids.shift() ?? "extra",
  });
  const chatApp = buildApp({ textProvider, executionStore: store });

  try {
    const response = await chatApp.inject({
      method: "POST",
      url: "/chat",
      headers: { "x-request-id": "chat-request" },
      payload: { message: "  hello  " },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { reply: "hello" });
    const snapshot = store.get("exec_chat-execution");
    assert.equal(snapshot?.state, "completed");
    assert.equal(snapshot?.requestId, "chat-request");
    assert.deepEqual(snapshot?.response, { text: "hello" });
  } finally {
    await chatApp.close();
  }
});

test("provider failures return controlled public problems", async () => {
  const providerApp = buildApp({
    textProvider: {
      async generateText() {
        throw new ProviderError({
          code: "PROVIDER_REQUEST_REJECTED",
          message: "raw private provider payload",
          status: 502,
          retryable: false,
        });
      },
    },
  });
  try {
    const response = await providerApp.inject({
      method: "POST", url: "/chat", payload: { message: "hello" },
    });
    assertProblem(response, {
      status: 502,
      code: "PROVIDER_REQUEST_REJECTED",
      retryable: false,
      detail: "The provider rejected the request.",
    });
    assert.equal(response.body.includes("raw private provider payload"), false);
  } finally {
    await providerApp.close();
  }
});

test("unknown routes and missing executions use canonical problems", async () => {
  const missingRoute = await app.inject({ method: "GET", url: "/missing" });
  assertProblem(missingRoute, {
    status: 404, code: "ROUTE_NOT_FOUND", retryable: false,
  });

  const missingExecution = await app.inject({
    method: "GET", url: "/api/v1/executions/exec_missing",
  });
  assertProblem(missingExecution, {
    status: 404, code: "EXECUTION_NOT_FOUND", retryable: false,
  });
});
