import assert from "node:assert/strict";
import { test } from "node:test";
import { ProviderError } from "./providers/errors.js";
import { LlamaCppProvider, type LlamaCppProviderOptions } from "./providers/llama-cpp-provider.js";

const MODEL = "qwen-local";

function providerWithResponse(response: Response): LlamaCppProvider {
  return new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async () => response,
  });
}

// ---------------------------------------------------------------------------
// Constructor / configuration
// ---------------------------------------------------------------------------

test("LlamaCpp adapter uses default base URL", () => {
  let capturedUrl = "";
  const provider = new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async (input) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    },
  });
  provider.generateText({ input: "test" });
  assert.ok(capturedUrl.startsWith("http://127.0.0.1:8080/v1"));
});

test("LlamaCpp adapter normalizes custom base URL", () => {
  let capturedUrl = "";
  const provider = new LlamaCppProvider({
    model: MODEL,
    baseUrl: " http://custom.test:4321/v1/ ",
    fetchImplementation: async (input) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    },
  });
  provider.generateText({ input: "test" });
  assert.ok(capturedUrl.startsWith("http://custom.test:4321/v1/chat/completions"));
  assert.ok(!capturedUrl.includes("//v1/chat"));
});

test("LlamaCpp adapter custom model", () => {
  const provider = new LlamaCppProvider({
    model: " my-custom-model ",
    fetchImplementation: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], model: "my-custom-model" }), { status: 200 }),
  });
  assert.equal((provider as any).model, "my-custom-model");
});

test("LlamaCpp adapter rejects empty model", () => {
  assert.throws(
    () => new LlamaCppProvider({ model: " " }),
    { message: "LlamaCpp provider requires a model name." },
  );
});

test("LlamaCpp adapter rejects empty base URL", () => {
  assert.throws(
    () => new LlamaCppProvider({ model: MODEL, baseUrl: " " }),
    { message: "LlamaCpp provider requires a base URL." },
  );
});

test("LlamaCpp adapter rejects invalid timeout", () => {
  assert.throws(
    () => new LlamaCppProvider({ model: MODEL, timeoutMs: 0 }),
    { message: "LlamaCpp timeout must be a positive integer." },
  );

  assert.throws(
    () => new LlamaCppProvider({ model: MODEL, timeoutMs: -1 }),
    { message: "LlamaCpp timeout must be a positive integer." },
  );
});

// ---------------------------------------------------------------------------
// Non-streaming
// ---------------------------------------------------------------------------

test("LlamaCpp adapter constructs the expected chat request", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const provider = new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async (input, init) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          model: MODEL,
          choices: [{ message: { content: "Hello from llama" } }],
        }),
        { status: 200 },
      );
    },
  });

  const result = await provider.generateText({ input: "  Hello Llama  " });

  assert.equal(capturedUrl, "http://127.0.0.1:8080/v1/chat/completions");
  assert.equal(capturedInit?.method, "POST");

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("Content-Type"), "application/json");

  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    model: MODEL,
    messages: [{ role: "user", content: "Hello Llama" }],
    stream: false,
  });

  assert.deepEqual(result, {
    provider: "llama-cpp",
    model: MODEL,
    text: "Hello from llama",
  });
});

test("LlamaCpp adapter rejects empty input", async () => {
  const provider = providerWithResponse(new Response(null, { status: 200 }));
  await assert.rejects(
    provider.generateText({ input: "   " }),
    { message: "Provider input must not be empty." },
  );
});

test("LlamaCpp adapter rejects malformed JSON", async () => {
  await assert.rejects(
    providerWithResponse(new Response("{", { status: 200 })).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("LlamaCpp adapter rejects missing choices", async () => {
  await assert.rejects(
    providerWithResponse(new Response(JSON.stringify({}), { status: 200 })).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    },
  );
});

test("LlamaCpp adapter rejects missing message", async () => {
  await assert.rejects(
    providerWithResponse(new Response(JSON.stringify({ choices: [{}] }), { status: 200 })).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    },
  );
});

test("LlamaCpp adapter rejects empty content", async () => {
  await assert.rejects(
    providerWithResponse(
      new Response(JSON.stringify({ choices: [{ message: { content: "   " } }] }), { status: 200 }),
    ).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    },
  );
});

test("LlamaCpp adapter normalizes HTTP 400 as request rejected", async () => {
  await assert.rejects(
    providerWithResponse(new Response(null, { status: 400 })).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_REQUEST_REJECTED");
      assert.equal(error.status, 502);
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

for (const status of [401, 403]) {
  test(`LlamaCpp adapter normalizes HTTP ${status} as authentication failure`, async () => {
    await assert.rejects(
      providerWithResponse(new Response(null, { status })).generateText({ input: "Hello" }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.code, "PROVIDER_AUTHENTICATION_FAILED");
        assert.equal(error.retryable, false);
        return true;
      },
    );
  });
}

test("LlamaCpp adapter normalizes HTTP 404 as model not found", async () => {
  await assert.rejects(
    providerWithResponse(new Response(null, { status: 404 })).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_MODEL_NOT_FOUND");
      assert.equal(error.status, 503);
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("LlamaCpp adapter normalizes HTTP 429 as rate limited", async () => {
  await assert.rejects(
    providerWithResponse(new Response(null, { status: 429 })).generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_RATE_LIMITED");
      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

for (const status of [500, 502, 503, 504]) {
  test(`LlamaCpp adapter normalizes HTTP ${status} as retryable unavailability`, async () => {
    await assert.rejects(
      providerWithResponse(new Response(null, { status })).generateText({ input: "Hello" }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.code, "PROVIDER_UNAVAILABLE");
        assert.equal(error.retryable, true);
        return true;
      },
    );
  });
}

test("LlamaCpp adapter normalizes network failures", async () => {
  const provider = new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async () => { throw new TypeError("Network failure"); },
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

test("LlamaCpp adapter normalizes request timeouts", async () => {
  const provider = new LlamaCppProvider({
    model: MODEL,
    timeoutMs: 10,
    fetchImplementation: async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
  });

  await assert.rejects(
    provider.generateText({ input: "Hello" }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_TIMEOUT");
      assert.equal(error.status, 504);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("LlamaCpp adapter normalizes caller cancellation", async () => {
  const ac = new AbortController();
  ac.abort();

  const provider = new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async () => {
      throw new Error("Fetch should not have been called.");
    },
  });

  await assert.rejects(
    provider.generateText({ input: "Hello", signal: ac.signal }),
    (error: unknown) => {
      // The caller's AbortError should propagate
      assert.ok(error instanceof DOMException || error instanceof Error);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Streaming helpers
// ---------------------------------------------------------------------------

function mockStreamResponse(chunks: (string | Uint8Array)[]): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function collectStreamChunks(
  provider: LlamaCppProvider,
  input = "Hello",
): Promise<Array<{ delta: string; done: boolean }>> {
  const chunks: Array<{ delta: string; done: boolean }> = [];
  for await (const chunk of provider.streamText!({ input })) {
    chunks.push({ delta: chunk.delta, done: chunk.done });
  }
  return chunks;
}

function buildSseData(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildChunkWithRole(): string {
  return buildSseData({ choices: [{ delta: { role: "assistant" } }], model: MODEL });
}

function buildChunkWithFinish(): string {
  return buildSseData({ choices: [{ delta: {}, finish_reason: "stop" }], model: MODEL });
}

function buildDoneEvent(): string {
  return "data: [DONE]\n\n";
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

test("LlamaCpp stream - endpoint and stream true body", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const provider = new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async (input, init) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedInit = init;
      const p = { choices: [{ delta: { content: "Hello" } }], model: MODEL };
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(p)}\n\n`));
          c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    },
  });

  await collectStreamChunks(provider);

  assert.equal(capturedUrl, "http://127.0.0.1:8080/v1/chat/completions");
  assert.equal(capturedInit?.method, "POST");
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.model, MODEL);
  assert.equal(body.messages[0].content, "Hello");
  assert.equal(body.stream, true);
  assert.equal(body.think, undefined);
});

test("LlamaCpp stream - basic streamed text", async () => {
  const chunks = [buildSseData({ choices: [{ delta: { content: "Hello" } }], model: MODEL }), buildDoneEvent()];
  const provider = providerWithResponse(mockStreamResponse(chunks));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - LF-delimited SSE", async () => {
  const payload = JSON.stringify({ choices: [{ delta: { content: "Hello" } }], model: MODEL });
  const raw = `data: ${payload}\n\n`;
  const done = "data: [DONE]\n\n";
  const provider = providerWithResponse(mockStreamResponse([raw, done]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - CRLF-delimited SSE", async () => {
  const p1 = JSON.stringify({ choices: [{ delta: { content: "Hello" } }], model: MODEL });
  const p2 = JSON.stringify({ choices: [{ delta: { content: " World" } }], model: MODEL });
  const raw = `data: ${p1}\r\n\r\ndata: ${p2}\r\n\r\n`;
  const done = "data: [DONE]\r\n\r\n";
  const provider = providerWithResponse(mockStreamResponse([raw, done]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: " World", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - multiple events in one fetch chunk", async () => {
  const p1 = JSON.stringify({ choices: [{ delta: { content: "A" } }], model: MODEL });
  const p2 = JSON.stringify({ choices: [{ delta: { content: "B" } }], model: MODEL });
  const raw = `data: ${p1}\n\ndata: ${p2}\n\n`;
  const done = "data: [DONE]\n\n";
  const provider = providerWithResponse(mockStreamResponse([raw, done]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "A", done: false },
    { delta: "B", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - event split across chunks", async () => {
  const p = JSON.stringify({ choices: [{ delta: { content: "LongText" } }], model: MODEL });
  const raw = `data: ${p}\n\n`;
  const part1 = raw.slice(0, 15);
  const part2 = raw.slice(15);
  const done = "data: [DONE]\n\n";
  const provider = providerWithResponse(mockStreamResponse([part1, part2, done]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "LongText", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - delimiter split across chunks", async () => {
  const p1 = JSON.stringify({ choices: [{ delta: { content: "A" } }], model: MODEL });
  const p2 = JSON.stringify({ choices: [{ delta: { content: "B" } }], model: MODEL });
  const provider = providerWithResponse(mockStreamResponse([
    `data: ${p1}\n`,
    `\ndata: ${p2}\n\n`,
    "data: [DONE]\n\n",
  ]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "A", done: false },
    { delta: "B", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - split multibyte UTF-8 character", async () => {
  const emoji = "✨";
  const p = JSON.stringify({ choices: [{ delta: { content: emoji } }], model: MODEL });
  const payloadStr = `data: ${p}\n\n`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payloadStr);
  const emojiBytes = encoder.encode(emoji);
  const emojiIdx = bytes.indexOf(emojiBytes[0]);
  const part1 = bytes.slice(0, emojiIdx + 1);
  const part2 = bytes.slice(emojiIdx + 1);
  const done = encoder.encode("data: [DONE]\n\n");
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(part1);
      controller.enqueue(part2);
      controller.enqueue(done);
      controller.close();
    },
  });
  const provider = providerWithResponse(new Response(stream, { status: 200 }));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "✨", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - metadata-only chunks ignored", async () => {
  const provider = providerWithResponse(mockStreamResponse([
    buildChunkWithRole(),
    buildSseData({ choices: [{ delta: { content: "Hello" } }], model: MODEL }),
    buildChunkWithFinish(),
    buildDoneEvent(),
  ]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - multiple data lines", async () => {
  const line1 = '{"choices":[{"delta":{';
  const line2 = '"content":"Hello"';
  const line3 = '}}],"model":"qwen-local"}';
  const sseData = `data: ${line1}\ndata: ${line2}\ndata: ${line3}\n\n`;
  const provider = providerWithResponse(mockStreamResponse([sseData, buildDoneEvent()]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - final frame without trailing blank line", async () => {
  const p = JSON.stringify({ choices: [{ delta: { content: "Hello" } }], model: MODEL });
  const provider = providerWithResponse(mockStreamResponse([`data: ${p}`]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - [DONE] event", async () => {
  const p = JSON.stringify({ choices: [{ delta: { content: "Hello" } }], model: MODEL });
  const provider = providerWithResponse(mockStreamResponse([
    `data: ${p}\n\n`,
    "data: [DONE]\n\n",
  ]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - malformed event JSON", async () => {
  const provider = providerWithResponse(mockStreamResponse(["data: {invalid\n\n"]));
  await assert.rejects(
    collectStreamChunks(provider),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    },
  );
});

test("LlamaCpp stream - stream with no usable content", async () => {
  const provider = providerWithResponse(mockStreamResponse([
    buildChunkWithRole(),
    buildChunkWithFinish(),
    buildDoneEvent(),
  ]));
  await assert.rejects(
    collectStreamChunks(provider),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    },
  );
});

test("LlamaCpp stream - timeout in streaming", async () => {
  const provider = new LlamaCppProvider({
    model: MODEL,
    timeoutMs: 10,
    fetchImplementation: async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
  });

  await assert.rejects(
    collectStreamChunks(provider),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_TIMEOUT");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("LlamaCpp stream - caller cancellation", async () => {
  const ac = new AbortController();
  ac.abort();

  const provider = new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async () => {
      throw new Error("Fetch should not have been called.");
    },
  });

  await assert.rejects(
    (async () => {
      const chunks: Array<{ delta: string; done: boolean }> = [];
      for await (const chunk of provider.streamText!({ input: "Hello", signal: ac.signal })) {
        chunks.push({ delta: chunk.delta, done: chunk.done });
      }
      return chunks;
    })(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      return true;
    },
  );
});

test("LlamaCpp stream - exactly one final done chunk", async () => {
  const p1 = JSON.stringify({ choices: [{ delta: { content: "A" } }], model: MODEL });
  const p2 = JSON.stringify({ choices: [{ delta: { content: "B" } }], model: MODEL });
  const provider = providerWithResponse(mockStreamResponse([
    `data: ${p1}\n\n`,
    `data: ${p2}\n\n`,
    buildDoneEvent(),
  ]));
  const chunks = await collectStreamChunks(provider);
  const doneChunks = chunks.filter((c) => c.done);
  assert.equal(doneChunks.length, 1);
  assert.equal(doneChunks[0].delta, "");
});

test("LlamaCpp stream - provider and model on every yielded chunk", async () => {
  const p1 = JSON.stringify({ choices: [{ delta: { content: "A" } }], model: MODEL });
  const p2 = JSON.stringify({ choices: [{ delta: { content: "B" } }], model: MODEL });
  const provider = new LlamaCppProvider({
    model: MODEL,
    fetchImplementation: async () => {
      const encoder = new TextEncoder();
      const raw = `data: ${p1}\n\ndata: ${p2}\n\n` + "data: [DONE]\n\n";
      const stream = new ReadableStream({
        start(c) { c.enqueue(encoder.encode(raw)); c.close(); },
      });
      return new Response(stream, { status: 200 });
    },
  });

  const chunks: Array<{ provider: string; model: string; delta: string; done: boolean }> = [];
  for await (const chunk of provider.streamText!({ input: "Hello" })) {
    chunks.push({ ...chunk });
  }

  assert.equal(chunks.length, 3);
  for (const chunk of chunks) {
    assert.equal(chunk.provider, "llama-cpp");
    assert.equal(chunk.model, MODEL);
  }
});

test("LlamaCpp stream - uses model from response payload", async () => {
  const p1 = JSON.stringify({ choices: [{ delta: { content: "A" } }], model: "response-model" });
  const provider = new LlamaCppProvider({
    model: "configured-model",
    fetchImplementation: async () => {
      const encoder = new TextEncoder();
      const raw = `data: ${p1}\n\n` + "data: [DONE]\n\n";
      const stream = new ReadableStream({
        start(c) { c.enqueue(encoder.encode(raw)); c.close(); },
      });
      return new Response(stream, { status: 200 });
    },
  });

  const chunks: Array<{ model: string; delta: string; done: boolean }> = [];
  for await (const chunk of provider.streamText!({ input: "Hello" })) {
    chunks.push({ model: chunk.model, delta: chunk.delta, done: chunk.done });
  }

  assert.equal(chunks[0].model, "response-model");
  assert.equal(chunks[1].model, "configured-model");
});

test("LlamaCpp stream - SSE comment ignored", async () => {
  const p = JSON.stringify({ choices: [{ delta: { content: "Hello" } }], model: MODEL });
  const sseData = ": this is a comment\ndata: " + p + "\n\n";
  const provider = providerWithResponse(mockStreamResponse([sseData, buildDoneEvent()]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - finish chunk with no delta content ignored", async () => {
  const pContent = JSON.stringify({ choices: [{ delta: { content: "Hello" } }], model: MODEL });
  const pFinish = JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], model: MODEL });
  const provider = providerWithResponse(mockStreamResponse([
    `data: ${pContent}\n\n`,
    `data: ${pFinish}\n\n`,
    buildDoneEvent(),
  ]));
  const result = await collectStreamChunks(provider);
  assert.deepEqual(result, [
    { delta: "Hello", done: false },
    { delta: "", done: true },
  ]);
});

test("LlamaCpp stream - non-streaming payload is not accepted", async () => {
  const p = JSON.stringify({ choices: [{ message: { content: "Hello" } }], model: MODEL });
  const provider = providerWithResponse(mockStreamResponse([`data: ${p}\n\n`]));
  await assert.rejects(
    collectStreamChunks(provider),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "PROVIDER_INVALID_RESPONSE");
      return true;
    },
  );
});
