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
      textProvider: "ollama",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "qwen3:0.6b",
      ollamaTimeoutMs: 120000,
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
      TEXT_PROVIDER: "gemini",
      OLLAMA_BASE_URL: "http://ollama.test:11434/",
      OLLAMA_MODEL: "ollama-test-model",
      OLLAMA_TIMEOUT_MS: "30000",
      GEMINI_API_KEY: "test-placeholder-key",
      GEMINI_MODEL: "gemini-test-model",
      GEMINI_TIMEOUT_MS: "45000",
    }),
    {
      host: "0.0.0.0",
      port: 8080,
      textProvider: "gemini",
      ollamaBaseUrl: "http://ollama.test:11434/",
      ollamaModel: "ollama-test-model",
      ollamaTimeoutMs: 30000,
      geminiApiKey: "test-placeholder-key",
      geminiModel: "gemini-test-model",
      geminiTimeoutMs: 45000,
    },
  );
});

test("configuration accepts Gemini provider selection with whitespace", () => {
  assert.equal(
    loadApiConfig({
      TEXT_PROVIDER: "  gemini  ",
    }).textProvider,
    "gemini",
  );
});

test("configuration rejects blank or unsupported provider selection", () => {
  for (const value of ["   ", "Gemini", "unknown"]) {
    assert.throws(
      () => loadApiConfig({ TEXT_PROVIDER: value }),
      {
        message:
          'TEXT_PROVIDER must be either "ollama" or "gemini".',
      },
    );
  }
});

test("configuration rejects blank Ollama values", () => {
  assert.throws(
    () =>
      loadApiConfig({
        OLLAMA_BASE_URL: "   ",
      }),
    {
      message:
        "OLLAMA_BASE_URL must not be empty.",
    },
  );

  assert.throws(
    () =>
      loadApiConfig({
        OLLAMA_MODEL: "   ",
      }),
    {
      message:
        "OLLAMA_MODEL must not be empty.",
    },
  );
});

test("configuration rejects invalid Ollama timeouts", () => {
  for (const value of ["invalid", "0"]) {
    assert.throws(
      () =>
        loadApiConfig({
          OLLAMA_TIMEOUT_MS: value,
        }),
      {
        message:
          "OLLAMA_TIMEOUT_MS must be a positive whole number.",
      },
    );
  }
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
