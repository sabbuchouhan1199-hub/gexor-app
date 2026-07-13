import {
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { App } from "./App";

describe("Gexor browser chat", () => {
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
        "Enter a message to verify the browser-to-API connection.",
      ),
    ).toBeInTheDocument();
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
          reply: "Mock reply: Hello Gexor",
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
      await screen.findByText("Mock reply: Hello Gexor"),
    ).toBeInTheDocument();
  });

  test("submits trimmed input and displays the successful reply", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          reply: "Mock reply: Hello Gexor",
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
      "/mock/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Hello Gexor",
        }),
      },
    );

    expect(
      await screen.findByText("Mock reply: Hello Gexor"),
    ).toBeInTheDocument();
  });

  test("shows a recoverable error when the API rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "Service unavailable",
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
      "API request failed with HTTP 503.",
    );

    expect(
      screen.getByRole("button", {
        name: "Send",
      }),
    ).toBeEnabled();
  });
});
