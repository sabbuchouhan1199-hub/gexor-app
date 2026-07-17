import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderError } from "./providers/errors.js";
import { GeminiProvider } from "./providers/gemini-provider.js";

const API_KEY = "test-placeholder-key";
const MODEL = "gemini-test-model";

function providerWithResponse(
  response: Response,
): GeminiProvider {
  return new GeminiProvider({
    apiKey: API_KEY,
    model: MODEL,
    fetchImplementation: async () => response,
  });
}

test("Gemini adapter constructs a credential-safe generateContent request", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const provider = new GeminiProvider({
    apiKey: API_KEY,
    model: MODEL,
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
                  { text: " First part " },
                  { text: "Second part" },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

  const result = await provider.generateText({
    input: "  Hello Gemini  ",
  });

  assert.equal(
    capturedUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent",
  );
  assert.equal(capturedUrl.includes(API_KEY), false);
  assert.equal(capturedInit?.method, "POST");

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("x-goog-api-key"), API_KEY);
  assert.equal(headers.get("Content-Type"), "application/json");

  const body = String(capturedInit?.body);
  assert.equal(body.includes(API_KEY), false);
  assert.deepEqual(JSON.parse(body), {
    contents: [
      {
        role: "user",
        parts: [{ text: "Hello Gemini" }],
      },
    ],
  });
  assert.deepEqual(result, {
    provider: "gemini",
    model: MODEL,
    text: "First part\nSecond part",
  });
});

test("Gemini adapter validates constructor options without fetching", () => {
  const fetchImplementation: typeof fetch = async () => {
    throw new Error("Fetch should not have been called.");
  };

  assert.throws(
    () =>
      new GeminiProvider({
        apiKey: " ",
        model: MODEL,
        fetchImplementation,
      }),
    { message: "Gemini provider requires an API key." },
  );
  assert.throws(
    () =>
      new GeminiProvider({
        apiKey: API_KEY,
        model: " ",
        fetchImplementation,
      }),
    { message: "Gemini provider requires a model name." },
  );
  assert.throws(
    () =>
      new GeminiProvider({
        apiKey: API_KEY,
        model: MODEL,
        timeoutMs: 0,
        fetchImplementation,
      }),
    { message: "Gemini timeout must be a positive integer." },
  );
});

test("Gemini adapter rejects empty input without fetching", async () => {
  const provider = new GeminiProvider({
    apiKey: API_KEY,
    model: MODEL,
    fetchImplementation: async () => {
      throw new Error("Fetch should not have been called.");
    },
  });

  await assert.rejects(
    provider.generateText({ input: "   " }),
    { message: "Provider input must not be empty." },
  );
});

for (const status of [401, 403]) {
  test(`Gemini adapter normalizes HTTP ${status} as authentication failure`, async () => {
    await assert.rejects(
      providerWithResponse(
        new Response(null, { status }),
      ).generateText({ input: "Hello" }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(
          error.code,
          "PROVIDER_AUTHENTICATION_FAILED",
        );
        assert.equal(error.retryable, false);
        assert.equal(error.message.includes(API_KEY), false);
        return true;
      },
    );
  });
}

test("Gemini adapter normalizes a missing model", async () => {
  await assert.rejects(
    providerWithResponse(
      new Response(null, { status: 404 }),
    ).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_MODEL_NOT_FOUND");
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("Gemini adapter normalizes rate limiting", async () => {
  await assert.rejects(
    providerWithResponse(
      new Response(null, { status: 429 }),
    ).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_RATE_LIMITED");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

for (const status of [500, 502, 503, 504]) {
  test(`Gemini adapter normalizes HTTP ${status} as retryable unavailability`, async () => {
    await assert.rejects(
      providerWithResponse(
        new Response(null, { status }),
      ).generateText({ input: "Hello" }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.code, "PROVIDER_UNAVAILABLE");
        assert.equal(error.retryable, true);
        return true;
      },
    );
  });
}

test("Gemini adapter rejects malformed JSON", async () => {
  await assert.rejects(
    providerWithResponse(
      new Response("{", { status: 200 }),
    ).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("Gemini adapter rejects successful responses without usable text", async () => {
  await assert.rejects(
    providerWithResponse(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "   " }] } },
          ],
        }),
        { status: 200 },
      ),
    ).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("Gemini adapter normalizes network failures", async () => {
  const provider = new GeminiProvider({
    apiKey: API_KEY,
    model: MODEL,
    fetchImplementation: async () => {
      throw new TypeError("Network failure");
    },
  });

  await assert.rejects(
    provider.generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_UNAVAILABLE");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("Gemini adapter normalizes local request timeouts", async () => {
  const provider = new GeminiProvider({
    apiKey: API_KEY,
    model: MODEL,
    timeoutMs: 10,
    fetchImplementation: async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("Aborted", "AbortError"),
            ),
          { once: true },
        );
      }),
  });

  await assert.rejects(
    provider.generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_TIMEOUT");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});
