import assert from "node:assert/strict";
import {
  after,
  test,
} from "node:test";

import { buildApp } from "./app.js";

const app = buildApp();

after(async () => {
  await app.close();
});

test("GET /health returns the healthy service state", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
  });
});

test("POST /mock/chat returns a deterministic reply", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "Hello Gexor",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    reply: "Mock reply: Hello Gexor",
  });
});

test("POST /mock/chat trims accepted input", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "  Hello Gexor  ",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    reply: "Mock reply: Hello Gexor",
  });
});

test("empty input returns a normalized validation error", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      status: 400,
    },
  });
});

test("whitespace input returns a normalized validation error", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "   ",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      status: 400,
    },
  });
});

test("unknown fields return a normalized validation error", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "Hello Gexor",
      unauthorizedField: "not allowed",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      status: 400,
    },
  });
});

test("oversized input returns a normalized validation error", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "a".repeat(4001),
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      status: 400,
    },
  });
});

test("unknown routes return a normalized not-found error", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/route-that-does-not-exist",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "The requested route was not found.",
      status: 404,
    },
  });
});
