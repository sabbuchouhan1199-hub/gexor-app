import assert from "node:assert/strict";
import {
  test,
} from "node:test";

import {
  ProviderError,
} from "./providers/errors.js";
import {
  OllamaProvider,
} from "./providers/ollama-provider.js";

test("Ollama adapter constructs the expected chat request", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const provider = new OllamaProvider({
    model: "qwen3:0.6b",
    fetchImplementation: async (
      input,
      init,
    ) => {
      capturedUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      capturedInit = init;

      return new Response(
        JSON.stringify({
          model: "qwen3:0.6b",
          message: {
            role: "assistant",
            content: "Local provider reply",
          },
          done: true,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    },
  });

  const result = await provider.generateText({
    input: "  Hello Ollama  ",
  });

  assert.equal(
    capturedUrl,
    "http://127.0.0.1:11434/api/chat",
  );

  assert.equal(capturedInit?.method, "POST");

  const headers = new Headers(
    capturedInit?.headers,
  );

  assert.equal(
    headers.get("Content-Type"),
    "application/json",
  );

  assert.deepEqual(
    JSON.parse(String(capturedInit?.body)),
    {
      model: "qwen3:0.6b",
      messages: [
        {
          role: "user",
          content: "Hello Ollama",
        },
      ],
      stream: false,
      think: false,
    },
  );

  assert.deepEqual(result, {
    provider: "ollama",
    model: "qwen3:0.6b",
    text: "Local provider reply",
  });
});

test("Ollama adapter rejects empty input", async () => {
  const provider = new OllamaProvider({
    model: "qwen3:0.6b",
    fetchImplementation: async () => {
      throw new Error(
        "Fetch should not have been called.",
      );
    },
  });

  await assert.rejects(
    provider.generateText({
      input: "   ",
    }),
    {
      message:
        "Provider input must not be empty.",
    },
  );
});

test("Ollama adapter normalizes missing models", async () => {
  const provider = new OllamaProvider({
    model: "qwen3:0.6b",
    fetchImplementation: async () => {
      return new Response(null, {
        status: 404,
      });
    },
  });

  await assert.rejects(
    provider.generateText({
      input: "Hello",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);

      assert.equal(
        error.code,
        "PROVIDER_MODEL_NOT_FOUND",
      );

      assert.equal(error.status, 503);
      assert.equal(error.retryable, false);

      return true;
    },
  );
});

test("Ollama adapter rejects responses without text", async () => {
  const provider = new OllamaProvider({
    model: "qwen3:0.6b",
    fetchImplementation: async () => {
      return new Response(
        JSON.stringify({
          model: "qwen3:0.6b",
          message: {
            role: "assistant",
            content: "   ",
          },
          done: true,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    },
  });

  await assert.rejects(
    provider.generateText({
      input: "Hello",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);

      assert.equal(
        error.code,
        "PROVIDER_INVALID_RESPONSE",
      );

      assert.equal(error.status, 502);

      return true;
    },
  );
});

test("Ollama adapter normalizes network failures", async () => {
  const provider = new OllamaProvider({
    model: "qwen3:0.6b",
    fetchImplementation: async () => {
      throw new TypeError(
        "Connection refused",
      );
    },
  });

  await assert.rejects(
    provider.generateText({
      input: "Hello",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);

      assert.equal(
        error.code,
        "PROVIDER_UNAVAILABLE",
      );

      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);

      return true;
    },
  );
});

test("Ollama adapter normalizes request timeouts", async () => {
  const provider = new OllamaProvider({
    model: "qwen3:0.6b",
    timeoutMs: 10,
    fetchImplementation: async (
      _input,
      init,
    ) => {
      return await new Promise<Response>(
        (_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(
                new DOMException(
                  "Aborted",
                  "AbortError",
                ),
              );
            },
            {
              once: true,
            },
          );
        },
      );
    },
  });

  await assert.rejects(
    provider.generateText({
      input: "Hello",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);

      assert.equal(
        error.code,
        "PROVIDER_TIMEOUT",
      );

      assert.equal(error.status, 504);
      assert.equal(error.retryable, true);

      return true;
    },
  );
});