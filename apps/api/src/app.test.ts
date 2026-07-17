import assert from "node:assert/strict";
import {
  after,
  test,
} from "node:test";

import { buildApp } from "./app.js";
import {
  ProviderError,
  type ProviderErrorCode,
} from "./providers/errors.js";
import type { TextProvider } from "./providers/provider.js";

let providerCallCount = 0;

const textProvider: TextProvider = {
  async generateText(request) {
    providerCallCount += 1;

    return {
      provider: "fake",
      model: "fake-model",
      text: request.input,
    };
  },
};

const app = buildApp({
  textProvider,
});

after(async () => {
  await app.close();
});

test("application retains the injected text provider", () => {
  assert.equal(
    app.textProvider,
    textProvider,
  );
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
  const callsBeforeRequest = providerCallCount;

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
  assert.equal(
    providerCallCount,
    callsBeforeRequest,
  );
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

test("POST /chat calls the provider once with trimmed input", async () => {
  const capturedRequests: Array<{
    input: string;
  }> = [];
  const provider: TextProvider = {
    async generateText(request) {
      capturedRequests.push(request);

      return {
        provider: "private-provider",
        model: "private-model",
        text: "Provider reply",
      };
    },
  };
  const chatApp = buildApp({
    textProvider: provider,
  });

  try {
    const response = await chatApp.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "  Hello Gexor  ",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(capturedRequests, [
      {
        input: "Hello Gexor",
      },
    ]);
    assert.deepEqual(response.json(), {
      reply: "Provider reply",
    });
    assert.equal(
      "provider" in response.json(),
      false,
    );
    assert.equal(
      "model" in response.json(),
      false,
    );
  } finally {
    await chatApp.close();
  }
});

test("POST /chat validation failures do not call the provider", async () => {
  let calls = 0;
  const provider: TextProvider = {
    async generateText(request) {
      calls += 1;

      return {
        provider: "fake",
        model: "fake-model",
        text: request.input,
      };
    },
  };
  const chatApp = buildApp({
    textProvider: provider,
  });
  const invalidPayloads = [
    {
      message: "",
    },
    {
      message: "   ",
    },
    {
      message: "Hello",
      unknown: true,
    },
    {
      message: "a".repeat(4001),
    },
  ];

  try {
    for (const payload of invalidPayloads) {
      const response = await chatApp.inject({
        method: "POST",
        url: "/chat",
        payload,
      });

      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Request validation failed.",
          status: 400,
        },
      });
    }

    assert.equal(calls, 0);
  } finally {
    await chatApp.close();
  }
});

const providerErrorCases: Array<{
  code: ProviderErrorCode;
  status: 502 | 503 | 504;
}> = [
  {
    code: "PROVIDER_AUTHENTICATION_FAILED",
    status: 502,
  },
  {
    code: "PROVIDER_INVALID_RESPONSE",
    status: 502,
  },
  {
    code: "PROVIDER_MODEL_NOT_FOUND",
    status: 503,
  },
  {
    code: "PROVIDER_RATE_LIMITED",
    status: 503,
  },
  {
    code: "PROVIDER_UNAVAILABLE",
    status: 503,
  },
  {
    code: "PROVIDER_TIMEOUT",
    status: 504,
  },
];

for (
  const {
    code,
    status,
  } of providerErrorCases
) {
  test(`POST /chat returns normalized ${code}`, async () => {
    let calls = 0;
    const message =
      "The provider request could not be completed.";
    const provider: TextProvider = {
      async generateText() {
        calls += 1;

        throw new ProviderError({
          code,
          message,
          status,
          retryable: true,
        });
      },
    };
    const chatApp = buildApp({
      textProvider: provider,
    });

    try {
      const response = await chatApp.inject({
        method: "POST",
        url: "/chat",
        payload: {
          message: "Hello Gexor",
        },
      });
      const body = response.json();

      assert.equal(response.statusCode, status);
      assert.deepEqual(body, {
        error: {
          code,
          message,
          status,
        },
      });
      assert.equal(
        "retryable" in body.error,
        false,
      );
      assert.equal(calls, 1);
    } finally {
      await chatApp.close();
    }
  });
}

test("POST /chat normalizes unexpected provider errors", async () => {
  const internalMessage =
    "Private provider implementation failure.";
  const provider: TextProvider = {
    async generateText() {
      throw new Error(internalMessage);
    },
  };
  const chatApp = buildApp({
    textProvider: provider,
  });

  try {
    const response = await chatApp.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Hello Gexor",
      },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message:
          "An unexpected server error occurred.",
        status: 500,
      },
    });
    assert.equal(
      response.body.includes(internalMessage),
      false,
    );
  } finally {
    await chatApp.close();
  }
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
