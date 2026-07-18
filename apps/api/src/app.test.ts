import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { ApiProblem } from "@gexor/contracts";
import { buildApp } from "./app.js";
import { ProviderError } from "./providers/errors.js";
import type { TextProvider } from "./providers/provider.js";

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
  assert.ok(body.title);
  assert.equal(body.detail, expected.detail ?? body.detail);
  return body;
}

test("GET /health returns a correlated healthy response", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
  assert.match(String(response.headers["x-request-id"]), /^req_/);
});

test("safe client request IDs are echoed and unsafe IDs are replaced", async () => {
  const accepted = await app.inject({
    method: "GET", url: "/health", headers: { "x-request-id": "client-123" },
  });
  assert.equal(accepted.headers["x-request-id"], "client-123");

  const replaced = await app.inject({
    method: "GET", url: "/health", headers: { "x-request-id": "unsafe id\nvalue" },
  });
  assert.notEqual(replaced.headers["x-request-id"], "unsafe id\nvalue");
  assert.match(String(replaced.headers["x-request-id"]), /^req_/);
});

test("POST /mock/chat remains deterministic", async () => {
  const callsBefore = providerCallCount;
  const response = await app.inject({
    method: "POST", url: "/mock/chat", payload: { message: "  Hello Gexor  " },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { reply: "Mock reply: Hello Gexor" });
  assert.equal(providerCallCount, callsBefore);
});

test("validation failures use the canonical problem contract and safe field errors", async () => {
  const response = await app.inject({
    method: "POST", url: "/chat", payload: { message: "", secret: "not exposed" },
  });
  const problem = assertProblem(response, {
    status: 400, code: "VALIDATION_ERROR", retryable: false,
    detail: "Request validation failed.",
  });
  assert.ok(problem.errors?.length);
  assert.equal(response.body.includes("not exposed"), false);
});

test("POST /chat returns provider text without provider metadata", async () => {
  const response = await app.inject({
    method: "POST", url: "/chat", payload: { message: "  hello  " },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { reply: "hello" });
});

test("provider failures expose provider-neutral problems and retryability", async () => {
  const provider: TextProvider = {
    async generateText() {
      throw new ProviderError({
        code: "PROVIDER_RATE_LIMITED",
        message: "raw private provider payload",
        status: 503,
        retryable: true,
      });
    },
  };
  const providerApp = buildApp({ textProvider: provider });
  try {
    const response = await providerApp.inject({
      method: "POST", url: "/chat", payload: { message: "hello" },
    });
    assertProblem(response, {
      status: 503,
      code: "PROVIDER_RATE_LIMITED",
      retryable: true,
      detail: "The provider temporarily rejected the request.",
    });
    assert.equal(response.body.includes("raw private provider payload"), false);
  } finally {
    await providerApp.close();
  }
});

test("unexpected failures do not expose internal details", async () => {
  const failingApp = buildApp({
    textProvider: { async generateText() { throw new Error("private failure"); } },
  });
  try {
    const response = await failingApp.inject({
      method: "POST", url: "/chat", payload: { message: "hello" },
    });
    assertProblem(response, {
      status: 500, code: "INTERNAL_SERVER_ERROR", retryable: false,
      detail: "An unexpected server error occurred.",
    });
    assert.equal(response.body.includes("private failure"), false);
  } finally {
    await failingApp.close();
  }
});

test("unknown routes use the canonical problem contract", async () => {
  const response = await app.inject({ method: "GET", url: "/missing" });
  assertProblem(response, {
    status: 404, code: "ROUTE_NOT_FOUND", retryable: false,
  });
});

test("message submission creates an in-memory execution and returns 202", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/conversations/conv_123/messages",
    headers: { "x-request-id": "request-123" },
    payload: { content: [{ type: "text", text: "Hello Gexor" }] },
  });
  assert.equal(response.statusCode, 202);
  const body = response.json();
  assert.match(body.messageId, /^msg_/);
  assert.match(body.executionId, /^exec_/);
  assert.equal(body.state, "created");
  assert.equal(body.requestId, "request-123");
  assert.equal(body.links.execution, `/api/v1/executions/${body.executionId}`);

  const getResponse = await app.inject({
    method: "GET", url: body.links.execution,
  });
  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(getResponse.json(), {
    id: body.executionId,
    conversationId: "conv_123",
    messageId: body.messageId,
    state: "created",
    createdAt: body.createdAt,
    updatedAt: body.createdAt,
    links: { self: body.links.execution },
  });
});

test("message submission rejects malformed content without creating an execution", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/conversations/conv_123/messages",
    payload: { content: [{ type: "text", text: "   " }] },
  });
  assertProblem(response, {
    status: 400, code: "VALIDATION_ERROR", retryable: false,
  });
});

test("missing executions return a canonical not-found problem", async () => {
  const response = await app.inject({
    method: "GET", url: "/api/v1/executions/exec_missing",
  });
  assertProblem(response, {
    status: 404, code: "EXECUTION_NOT_FOUND", retryable: false,
  });
});
