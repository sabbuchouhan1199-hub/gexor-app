import assert from "node:assert/strict";
import { test } from "node:test";

import { loadApiConfig } from "./config.js";
import { ProviderError } from "./providers/errors.js";
import { createTextProvider } from "./providers/provider-factory.js";

test("factory creates and configures an Ollama-backed text provider", async () => {
  let capturedUrl = "";
  let capturedBody = "";

  const provider = createTextProvider(
    loadApiConfig({
      TEXT_PROVIDER: "ollama",
      OLLAMA_BASE_URL:
        "http://ollama-factory.test:22434/",
      OLLAMA_MODEL: "ollama-factory-model",
      OLLAMA_TIMEOUT_MS: "45000",
    }),
    {
      fetchImplementation: async (input, init) => {
        capturedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        capturedBody = String(init?.body);

        return new Response(
          JSON.stringify({
            model: "ollama-factory-model",
            message: {
              role: "assistant",
              content: "Ollama factory reply",
            },
            done: true,
          }),
          { status: 200 },
        );
      },
    },
  );

  const result = await provider.generateText({
    input: "Hello",
  });

  assert.equal(
    capturedUrl,
    "http://ollama-factory.test:22434/api/chat",
  );
  assert.equal(
    JSON.parse(capturedBody).model,
    "ollama-factory-model",
  );
  assert.deepEqual(result, {
    provider: "ollama",
    model: "ollama-factory-model",
    text: "Ollama factory reply",
  });
});

test("factory creates and configures a Gemini-backed text provider", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const provider = createTextProvider(
    loadApiConfig({
      TEXT_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-credential",
      GEMINI_MODEL: "gemini-factory-model",
      GEMINI_TIMEOUT_MS: "45000",
    }),
    {
      fetchImplementation: async (input, init) => {
        capturedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        capturedInit = init;

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: "Gemini factory reply",
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    },
  );

  const result = await provider.generateText({
    input: "Hello",
  });

  assert.equal(
    capturedUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-factory-model:generateContent",
  );
  assert.equal(
    capturedUrl.includes("test-credential"),
    false,
  );

  const headers = new Headers(capturedInit?.headers);

  assert.equal(
    headers.get("x-goog-api-key"),
    "test-credential",
  );
  assert.equal(
    String(capturedInit?.body).includes(
      "test-credential",
    ),
    false,
  );
  assert.deepEqual(result, {
    provider: "gemini",
    model: "gemini-factory-model",
    text: "Gemini factory reply",
  });
});

test("factory forwards the configured Gemini timeout", async () => {
  const provider = createTextProvider(
    loadApiConfig({
      TEXT_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-credential",
      GEMINI_TIMEOUT_MS: "10",
    }),
    {
      fetchImplementation: async (_input, init) =>
        await new Promise<Response>(
          (_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () =>
                reject(
                  new DOMException(
                    "Aborted",
                    "AbortError",
                  ),
                ),
              { once: true },
            );
          },
        ),
    },
  );

  await assert.rejects(
    provider.generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_TIMEOUT");
      return true;
    },
  );
});

test("factory requires Gemini credentials before fetching", () => {
  let fetchCalled = false;

  assert.throws(
    () =>
      createTextProvider(
        loadApiConfig({
          TEXT_PROVIDER: "gemini",
        }),
        {
          fetchImplementation: async () => {
            fetchCalled = true;
            throw new Error(
              "Fetch should not have been called.",
            );
          },
        },
      ),
    {
      message:
        'GEMINI_API_KEY is required when TEXT_PROVIDER is "gemini".',
    },
  );
  assert.equal(fetchCalled, false);
});

test("factory maps llama-cpp workspace model override to llamaCppModel", async () => {
  let capturedUrl = "";
  let capturedBody = "";

  // server.ts does: createTextProvider({...config, textProvider: "llama-cpp", ...{ llamaCppModel: modelId }})
  const resolved = createTextProvider(
    {
      ...loadApiConfig({
        LLAMA_CPP_BASE_URL: "http://override.test:8080/v1/",
        LLAMA_CPP_MODEL: "default-model",
        LLAMA_CPP_TIMEOUT_MS: "45000",
      }),
      textProvider: "llama-cpp",
      llamaCppModel: "override-model",
    },
    {
      fetchImplementation: async (input, init) => {
        capturedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        capturedBody = String(init?.body);
        return new Response(
          JSON.stringify({
            model: "override-model",
            choices: [{ message: { content: "from override" } }],
          }),
          { status: 200 },
        );
      },
    },
  );

  await resolved.generateText({ input: "Hello" });
  assert.equal(capturedUrl, "http://override.test:8080/v1/chat/completions");
  assert.equal(
    JSON.parse(capturedBody).model,
    "override-model",
  );
});

test("factory creates and configures a LlamaCpp-backed text provider", async () => {
  let capturedUrl = "";
  let capturedBody = "";

  const provider = createTextProvider(
    loadApiConfig({
      TEXT_PROVIDER: "llama-cpp",
      LLAMA_CPP_BASE_URL: "http://llama-factory.test:8080/v1/",
      LLAMA_CPP_MODEL: "llama-factory-model",
      LLAMA_CPP_TIMEOUT_MS: "45000",
    }),
    {
      fetchImplementation: async (input, init) => {
        capturedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        capturedBody = String(init?.body);

        return new Response(
          JSON.stringify({
            model: "llama-factory-model",
            choices: [{ message: { content: "LlamaCpp factory reply" } }],
          }),
          { status: 200 },
        );
      },
    },
  );

  const result = await provider.generateText({
    input: "Hello",
  });

  assert.equal(
    capturedUrl,
    "http://llama-factory.test:8080/v1/chat/completions",
  );
  assert.equal(
    JSON.parse(capturedBody).model,
    "llama-factory-model",
  );
  assert.deepEqual(result, {
    provider: "llama-cpp",
    model: "llama-factory-model",
    text: "LlamaCpp factory reply",
  });
});

test("factory forwards the configured LlamaCpp timeout", async () => {
  const provider = createTextProvider(
    loadApiConfig({
      TEXT_PROVIDER: "llama-cpp",
      LLAMA_CPP_TIMEOUT_MS: "10",
    }),
    {
      fetchImplementation: async (_input, init) =>
        await new Promise<Response>(
          (_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () =>
                reject(
                  new DOMException(
                    "Aborted",
                    "AbortError",
                  ),
                ),
              { once: true },
            );
          },
        ),
    },
  );

  await assert.rejects(
    provider.generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_TIMEOUT");
      return true;
    },
  );
});

test("factory does not require Gemini credentials for LlamaCpp", async () => {
  const provider = createTextProvider(
    loadApiConfig({
      TEXT_PROVIDER: "llama-cpp",
    }),
    {
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            model: "qwen-local",
            choices: [{ message: { content: "LlamaCpp reply" } }],
          }),
          { status: 200 },
        ),
    },
  );

  assert.equal(
    (
      await provider.generateText({
        input: "Hello",
      })
    ).provider,
    "llama-cpp",
  );
});

test("factory does not require Gemini credentials for Ollama", async () => {
  const provider = createTextProvider(
    loadApiConfig({
      TEXT_PROVIDER: "ollama",
    }),
    {
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            model: "qwen3:0.6b",
            message: {
              content: "Local reply",
            },
          }),
          { status: 200 },
        ),
    },
  );

  assert.equal(
    (
      await provider.generateText({
        input: "Hello",
      })
    ).provider,
    "ollama",
  );
});
