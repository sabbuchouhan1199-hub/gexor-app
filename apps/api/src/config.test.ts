import assert from "node:assert/strict";
import {
  test,
} from "node:test";

import { loadApiConfig } from "./config.js";

test("configuration uses safe local defaults", () => {
  assert.deepEqual(
    loadApiConfig({}),
    {
      host: "127.0.0.1",
      port: 3001,
      geminiApiKey: undefined,
      geminiModel: "gemini-2.5-flash-lite",
      geminiTimeoutMs: 120000,
    },
  );
});

test("configuration accepts valid environment values", () => {
  assert.deepEqual(
    loadApiConfig({
      HOST: "0.0.0.0",
      PORT: "8080",
      GEMINI_API_KEY: "test-placeholder-key",
      GEMINI_MODEL: "gemini-test-model",
      GEMINI_TIMEOUT_MS: "45000",
    }),
    {
      host: "0.0.0.0",
      port: 8080,
      geminiApiKey: "test-placeholder-key",
      geminiModel: "gemini-test-model",
      geminiTimeoutMs: 45000,
    },
  );
});

test("configuration treats a blank Gemini API key as absent", () => {
  assert.equal(loadApiConfig({ GEMINI_API_KEY: "   " }).geminiApiKey, undefined);
});

test("configuration rejects a blank Gemini model", () => {
  assert.throws(
    () => loadApiConfig({ GEMINI_MODEL: "   " }),
    { message: "GEMINI_MODEL must not be empty." },
  );
});

test("configuration rejects an invalid Gemini timeout", () => {
  for (const value of ["invalid", "0", "1.5"]) {
    assert.throws(
      () => loadApiConfig({ GEMINI_TIMEOUT_MS: value }),
      { message: "GEMINI_TIMEOUT_MS must be a positive whole number." },
    );
  }
});

test("configuration rejects a nonnumeric port", () => {
  assert.throws(
    () => {
      loadApiConfig({
        PORT: "invalid",
      });
    },
    {
      message:
        "PORT must be a whole number between 1 and 65535.",
    },
  );
});

test("configuration rejects an out-of-range port", () => {
  assert.throws(
    () => {
      loadApiConfig({
        PORT: "70000",
      });
    },
    {
      message:
        "PORT must be a whole number between 1 and 65535.",
    },
  );
});
