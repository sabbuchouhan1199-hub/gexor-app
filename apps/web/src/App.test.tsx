import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { App } from "./App";

describe("Gexor browser chat", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("renders the initial accessible chat interface", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Gexor",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Message"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Send",
      }),
    ).toBeDisabled();

    expect(
      screen.getByText(
        "Enter a message to send it through the configured AI provider.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Configured AI provider",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Provider-backed MVP chat interface.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        "Deterministic mock API",
      ),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText(
        "Temporary MVP verification interface. No AI provider is connected.",
      ),
    ).not.toBeInTheDocument();
  });

  test("does not submit whitespace-only input", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();

    render(<App />);

    const input = screen.getByLabelText("Message");

    await user.type(input, "   ");

    expect(
      screen.getByRole("button", {
        name: "Send",
      }),
    ).toBeDisabled();

    await user.keyboard("{Enter}");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows a loading state while the request is pending", async () => {
    let resolveRequest:
      | ((response: Response) => void)
      | undefined;

    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingResponse),
    );

    const user = userEvent.setup();

    render(<App />);

    await user.type(
      screen.getByLabelText("Message"),
      "Hello Gexor",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Sending…",
      }),
    ).toBeDisabled();

    expect(
      screen.getByLabelText("Message"),
    ).toBeDisabled();

    resolveRequest?.(
      new Response(
        JSON.stringify({
          reply: "Provider reply",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    expect(
      await screen.findByText("Provider reply"),
    ).toBeInTheDocument();
  });

  test("submits trimmed input and displays the successful reply", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          reply: "Provider-generated reply",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();

    render(<App />);

    await user.type(
      screen.getByLabelText("Message"),
      "  Hello Gexor  ",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith(
      "/chat",
      {
        method: "POST",
        cache: "no-store",
        signal: expect.any(AbortSignal),
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Hello Gexor",
        }),
      },
    );

    expect(fetchMock).not.toHaveBeenCalledWith(
      "/mock/chat",
      expect.anything(),
    );

    expect(
      screen.getByLabelText("Message"),
    ).toHaveValue("");

    expect(
      await screen.findByText("Hello Gexor"),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Message"),
      "A different draft",
    );

    expect(
      screen.getByText("Hello Gexor"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "Provider-generated reply",
      ),
    ).toBeInTheDocument();
  });

  test("shows a recoverable error when the API rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message:
                "The provider is unavailable.",
              status: 503,
            },
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    const user = userEvent.setup();

    render(<App />);

    await user.type(
      screen.getByLabelText("Message"),
      "Hello Gexor",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "The provider is unavailable.",
    );

    expect(
      screen.getByLabelText("Message"),
    ).toHaveValue("Hello Gexor");

    expect(
      screen.getByRole("button", {
        name: "Send",
      }),
    ).toBeEnabled();
  });

  test("clears the sending state after a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Message"), "Retry me");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
    expect(screen.getByLabelText("Message")).toHaveValue("Retry me");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  test("aborts a request at the client timeout and restores the input", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Slow request" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }).closest("form")!);
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(125_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The request timed out. Please try again.",
    );
    expect(screen.getByLabelText("Message")).toHaveValue("Slow request");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
  });

  test("rejects a malformed successful response safely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ reply: "   " }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Message"), "Validate me");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The API returned an invalid reply. Please try again.",
    );
    expect(screen.getByLabelText("Message")).toHaveValue("Validate me");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  test("blocks duplicate submission while a request is pending", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Only once" },
    });
    const form = screen.getByRole("button", { name: "Send" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveRequest?.(new Response(
      JSON.stringify({ reply: "Once" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    expect(await screen.findByText("Once")).toBeInTheDocument();
  });
});
