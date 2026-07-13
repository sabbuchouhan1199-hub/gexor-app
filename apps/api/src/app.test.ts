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

test("POST /mock/chat rejects an empty message", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "",
    },
  });

  assert.equal(response.statusCode, 400);
});

test("POST /mock/chat rejects a whitespace-only message", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "   ",
    },
  });

  assert.equal(response.statusCode, 400);
});

test("POST /mock/chat rejects unexpected request fields", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "Hello Gexor",
      unauthorizedField: "must not be accepted",
    },
  });

  assert.equal(response.statusCode, 400);
});

test("POST /mock/chat rejects messages longer than 4000 characters", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/mock/chat",
    payload: {
      message: "a".repeat(4001),
    },
  });

  assert.equal(response.statusCode, 400);
});
