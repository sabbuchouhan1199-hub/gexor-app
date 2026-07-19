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
      geminiModel: "gemini-3.1-flash-lite",
      geminiTimeoutMs: 120000,
      llamaCppBaseUrl: "http://127.0.0.1:8080/v1",
      llamaCppModel: "qwen-local",
      llamaCppTimeoutMs: 120000,
      databasePath: ".data/gexor.sqlite",
      cookieSecure: false,
      uploadPath: ".data/uploads",
      maxUploadBytes: 5242880,
      maxWorkspaceUploadBytes: 26214400,
      maxConversationFiles: 20,
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
      LLAMA_CPP_BASE_URL: "http://llama.test:8080/v1/",
      LLAMA_CPP_MODEL: "llama-test-model",
      LLAMA_CPP_TIMEOUT_MS: "60000",
      NODE_ENV: "production",
      GEXOR_ALLOWED_ORIGIN: "http://127.0.0.1:5173",
      GEXOR_DATABASE_PATH: ".data/test.sqlite",
      GEXOR_UPLOAD_PATH: ".data/test-uploads",
      GEXOR_MAX_UPLOAD_BYTES: "1048576",
      GEXOR_MAX_WORKSPACE_UPLOAD_BYTES: "2097152",
      GEXOR_MAX_CONVERSATION_FILES: "3",
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
      llamaCppBaseUrl: "http://llama.test:8080/v1/",
      llamaCppModel: "llama-test-model",
      llamaCppTimeoutMs: 60000,
      databasePath: ".data/test.sqlite",
      cookieSecure: true,
      allowedOrigin: "http://127.0.0.1:5173",
      uploadPath: ".data/test-uploads",
      maxUploadBytes: 1048576,
      maxWorkspaceUploadBytes: 2097152,
      maxConversationFiles: 3,
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
          'TEXT_PROVIDER must be "ollama", "gemini", or "llama-cpp".',
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

test("configuration accepts llama-cpp provider selection", () => {
  assert.equal(
    loadApiConfig({
      TEXT_PROVIDER: "  llama-cpp  ",
    }).textProvider,
    "llama-cpp",
  );
});

test("configuration uses llama-cpp defaults", () => {
  const config = loadApiConfig({ TEXT_PROVIDER: "llama-cpp" });
  assert.equal(config.llamaCppBaseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(config.llamaCppModel, "qwen-local");
  assert.equal(config.llamaCppTimeoutMs, 120000);
});

test("configuration accepts valid llama-cpp values", () => {
  const config = loadApiConfig({
    TEXT_PROVIDER: "llama-cpp",
    LLAMA_CPP_BASE_URL: "http://custom.test:8080/v1",
    LLAMA_CPP_MODEL: "custom-model",
    LLAMA_CPP_TIMEOUT_MS: "30000",
  });
  assert.equal(config.llamaCppBaseUrl, "http://custom.test:8080/v1");
  assert.equal(config.llamaCppModel, "custom-model");
  assert.equal(config.llamaCppTimeoutMs, 30000);
});

test("configuration preserves trailing slash in llama-cpp base URL", () => {
  const withSlash = loadApiConfig({
    LLAMA_CPP_BASE_URL: "http://trailing.test:8080/v1/",
  });
  const withoutSlash = loadApiConfig({
    LLAMA_CPP_BASE_URL: "http://trailing.test:8080/v1",
  });
  assert.equal(withSlash.llamaCppBaseUrl, "http://trailing.test:8080/v1/");
  assert.equal(withoutSlash.llamaCppBaseUrl, "http://trailing.test:8080/v1");
});

test("configuration rejects blank llama-cpp values", () => {
  assert.throws(
    () => loadApiConfig({ LLAMA_CPP_BASE_URL: "   " }),
    { message: "LLAMA_CPP_BASE_URL must not be empty." },
  );

  assert.throws(
    () => loadApiConfig({ LLAMA_CPP_MODEL: "   " }),
    { message: "LLAMA_CPP_MODEL must not be empty." },
  );
});

test("configuration rejects invalid llama-cpp timeout", () => {
  for (const value of ["invalid", "0"]) {
    assert.throws(
      () => loadApiConfig({ LLAMA_CPP_TIMEOUT_MS: value }),
      { message: "LLAMA_CPP_TIMEOUT_MS must be a positive whole number." },
    );
  }
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
