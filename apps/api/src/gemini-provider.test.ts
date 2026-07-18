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

async function assertHttp400(
  body: BodyInit | null,
  expectedCode: "PROVIDER_AUTHENTICATION_FAILED" | "PROVIDER_REQUEST_REJECTED",
): Promise<void> {
  await assert.rejects(
    providerWithResponse(
      new Response(body, {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    ).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, expectedCode);
      assert.equal(error.status, 502);
      assert.equal(error.retryable, false);
      assert.equal(error.message.includes(API_KEY), false);
      assert.equal(error.message.includes("private provider message"), false);
      return true;
    },
  );
}

test("Gemini HTTP 400 API_KEY_INVALID is an authentication failure", async () => {
  await assertHttp400(
    JSON.stringify({
      error: {
        status: "INVALID_ARGUMENT",
        message: `private provider message ${API_KEY}`,
        details: [{ reason: "API_KEY_INVALID" }],
      },
    }),
    "PROVIDER_AUTHENTICATION_FAILED",
  );
});

test("Gemini generic structured HTTP 400 is request rejected", async () => {
  await assertHttp400(
    JSON.stringify({
      error: {
        status: "INVALID_ARGUMENT",
        message: `private provider message ${API_KEY}`,
        details: [{ reason: "INVALID_REQUEST" }],
      },
    }),
    "PROVIDER_REQUEST_REJECTED",
  );
});

test("Gemini malformed HTTP 400 JSON is request rejected", async () => {
  await assertHttp400("{", "PROVIDER_REQUEST_REJECTED");
});

test("Gemini absent HTTP 400 body is request rejected", async () => {
  await assertHttp400(null, "PROVIDER_REQUEST_REJECTED");
});

function mockStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function collectChunks(
  provider: GeminiProvider,
  input = "Hello",
): Promise<Array<{ delta: string; done: boolean }>> {
  const chunks: Array<{ delta: string; done: boolean }> = [];
  for await (const chunk of provider.streamText!({ input })) {
    chunks.push({ delta: chunk.delta, done: chunk.done });
  }
  return chunks;
}

test("Gemini stream - One LF-delimited SSE event containing text", async () => {
  const payload = JSON.stringify({
    candidates: [{ content: { parts: [{ text: "Hello" }] } }],
  });
  const response = mockStreamResponse([`data: ${payload}\n\n`]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - CRLF-delimited SSE events", async () => {
  const p1 = JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] });
  const p2 = JSON.stringify({ candidates: [{ content: { parts: [{ text: " World" }] } }] });
  const response = mockStreamResponse([`data: ${p1}\r\n\r\ndata: ${p2}\r\n\r\n`]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "Hello", done: false },
    { delta: " World", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - Multiple events delivered in one fetch chunk", async () => {
  const p1 = JSON.stringify({ candidates: [{ content: { parts: [{ text: "A" }] } }] });
  const p2 = JSON.stringify({ candidates: [{ content: { parts: [{ text: "B" }] } }] });
  const response = mockStreamResponse([`data: ${p1}\n\ndata: ${p2}\n\n`]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "A", done: false },
    { delta: "B", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - One event split across multiple reader chunks", async () => {
  const p = JSON.stringify({ candidates: [{ content: { parts: [{ text: "LongText" }] } }] });
  const raw = `data: ${p}\n\n`;
  const part1 = raw.slice(0, 15);
  const part2 = raw.slice(15);
  const response = mockStreamResponse([part1, part2]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "LongText", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - Separator split across reader chunks", async () => {
  const p1 = JSON.stringify({ candidates: [{ content: { parts: [{ text: "A" }] } }] });
  const p2 = JSON.stringify({ candidates: [{ content: { parts: [{ text: "B" }] } }] });
  const response = mockStreamResponse([
    `data: ${p1}\n`,
    `\ndata: ${p2}\n\n`,
  ]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "A", done: false },
    { delta: "B", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - A multibyte UTF-8 character split across chunks", async () => {
  const emoji = "✨"; // 3 bytes in UTF-8: 0xE2 0x9C 0xA8
  const p = JSON.stringify({ candidates: [{ content: { parts: [{ text: emoji }] } }] });
  const payloadStr = `data: ${p}\n\n`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payloadStr);
  
  const emojiBytes = encoder.encode(emoji);
  const emojiIdx = bytes.indexOf(emojiBytes[0]);
  
  const part1 = bytes.slice(0, emojiIdx + 1);
  const part2 = bytes.slice(emojiIdx + 1);
  
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(part1);
      controller.enqueue(part2);
      controller.close();
    },
  });
  const response = new Response(stream, { status: 200 });
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "✨", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - Payload containing both text and thoughtSignature", async () => {
  const payload = JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            { text: "ResponseText" },
            { text: "", thoughtSignature: "some-sig" }
          ]
        }
      }
    ]
  });
  const response = mockStreamResponse([`data: ${payload}\n\n`]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "ResponseText", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - Multiple text parts in one candidate", async () => {
  const payload = JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            { text: "Part1" },
            { text: "Part2" }
          ]
        }
      }
    ]
  });
  const response = mockStreamResponse([`data: ${payload}\n\n`]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "Part1Part2", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - SSE comment and unrelated fields ignored", async () => {
  const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] });
  const sseData = `: comment here\nevent: message\ndata: ${payload}\nid: 123\n\n`;
  const response = mockStreamResponse([sseData]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - Multiple data lines handled according to SSE semantics", async () => {
  const line1 = '{"candidates":[{"content":{"parts":[';
  const line2 = '{"text":"Part1"}';
  const line3 = ']}}]}';
  const sseData = `data: ${line1}\ndata: ${line2}\ndata: ${line3}\n\n`;
  const response = mockStreamResponse([sseData]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "Part1", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - Final event without trailing blank separator", async () => {
  const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] });
  const response = mockStreamResponse([`data: ${payload}`]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - [DONE] frame ignored", async () => {
  const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] });
  const response = mockStreamResponse([
    `data: ${payload}\n\n`,
    `data: [DONE]\n\n`
  ]);
  const provider = providerWithResponse(response);
  const chunks = await collectChunks(provider);
  assert.deepEqual(chunks, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("Gemini stream - Malformed JSON maps to PROVIDER_INVALID_RESPONSE", async () => {
  const response = mockStreamResponse([`data: {invalid-json\n\n`]);
  const provider = providerWithResponse(response);
  await assert.rejects(
    collectChunks(provider),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    }
  );
});

test("Gemini stream - Successful stream with no usable text maps to PROVIDER_INVALID_RESPONSE", async () => {
  const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: "   " }] } }] });
  const response = mockStreamResponse([`data: ${payload}\n\n`]);
  const provider = providerWithResponse(response);
  await assert.rejects(
    collectChunks(provider),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    }
  );
});
