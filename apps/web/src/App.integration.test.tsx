import {
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  beforeAll,
  expect,
  test,
  vi,
} from "vitest";

import { buildApp } from "../../api/src/app.js";
import type { TextProvider } from "../../api/src/providers/provider.js";
import { App } from "./App";

const textProvider: TextProvider = {
  async generateText(request) {
    return {
      provider: "fake",
      model: "fake-model",
      text: request.input,
    };
  },
};

const api = buildApp({
  textProvider,
});

beforeAll(async () => {
  await api.ready();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : new URL(input.url).pathname;

      const requestHeaders = Object.fromEntries(
        new Headers(init?.headers).entries(),
      );

      const injectedResponse = await api.inject({
        method: "POST",
        url: requestUrl,
        headers: requestHeaders,
        payload:
          typeof init?.body === "string"
            ? init.body
            : undefined,
      });

      return new Response(
        injectedResponse.body,
        {
          status: injectedResponse.statusCode,
          headers: {
            "Content-Type":
              injectedResponse.headers["content-type"] ??
              "application/json",
          },
        },
      );
    }),
  );
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await api.close();
});

test("React chat completes a request through the real Fastify application", async () => {
  const user = userEvent.setup();

  render(<App />);

  await user.type(
    screen.getByLabelText("Message"),
    "Integrated Gexor request",
  );

  await user.click(
    screen.getByRole("button", {
      name: "Send",
    }),
  );

  expect(
    screen.getByLabelText("Message"),
  ).toHaveValue("");

  expect(
    await screen.findByText("Integrated Gexor request"),
  ).toBeInTheDocument();

  expect(
    await screen.findByText(
      "Mock reply: Integrated Gexor request",
    ),
  ).toBeInTheDocument();
});
