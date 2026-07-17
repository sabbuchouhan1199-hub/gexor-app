import {
  type FormEvent,
  useRef,
  useState,
} from "react";

import type {
  ChatRequest,
  ChatResponse,
} from "@gexor/contracts";

export const CHAT_REQUEST_TIMEOUT_MS = 125_000;

type ApiErrorBody = { error?: { message?: unknown } };

function isChatResponse(value: unknown): value is ChatResponse {
  if (typeof value !== "object" || value === null) return false;
  const reply = (value as { reply?: unknown }).reply;
  return typeof reply === "string" && reply.trim().length > 0;
}

async function getApiErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    const apiMessage = body.error?.message;
    if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
  } catch {
    // Fall back to the HTTP status when the response body is not safe JSON.
  }
  return `API request failed with HTTP ${response.status}.`;
}

export function App() {
  const [message, setMessage] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const requestIdRef = useRef(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedMessage = message.trim();

    if (!normalizedMessage || isSendingRef.current) {
      return;
    }

    const requestBody: ChatRequest = {
      message: normalizedMessage,
    };

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const timeout = setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

    isSendingRef.current = true;
    setIsSending(true);
    setSubmittedMessage(normalizedMessage);
    setMessage("");
    setReply("");
    setError("");

    try {
      const response = await fetch("/chat", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      const responseBody: unknown = await response.json();
      if (!isChatResponse(responseBody)) {
        throw new Error("The API returned an invalid reply. Please try again.");
      }

      if (requestId === requestIdRef.current && !controller.signal.aborted) {
        setReply(responseBody.reply);
      }
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        const errorMessage = controller.signal.aborted
          ? "The request timed out. Please try again."
          : requestError instanceof Error
            ? requestError.message
            : "An unexpected request error occurred.";
        setMessage(normalizedMessage);
        setError(errorMessage);
      }
    } finally {
      clearTimeout(timeout);
      if (requestId === requestIdRef.current) {
        isSendingRef.current = false;
        setIsSending(false);
      }
    }
  }

  return (
    <main className="page-shell">
      <section className="chat-card" aria-labelledby="page-title">
        <header className="chat-header">
          <div className="brand-mark" aria-hidden="true">
            G
          </div>

          <div>
            <p className="eyebrow">AI Runtime Platform</p>
            <h1 id="page-title">Gexor</h1>
          </div>
        </header>

        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          Configured AI provider
        </div>

        <div className="conversation" aria-live="polite">
          <article className="message message-system">
            <p className="message-label">Gexor</p>
            <p>
              Enter a message to send it through the configured AI provider.
            </p>
          </article>

          {reply ? (
            <>
              <article className="message message-user">
                <p className="message-label">You</p>
                <p>{submittedMessage}</p>
              </article>

              <article className="message message-system">
                <p className="message-label">Gexor</p>
                <p>{reply}</p>
              </article>
            </>
          ) : null}

          {error ? (
            <article className="message message-error" role="alert">
              <p className="message-label">Request failed</p>
              <p>{error}</p>
            </article>
          ) : null}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <label htmlFor="chat-message">Message</label>

          <div className="composer-row">
            <input
              id="chat-message"
              name="message"
              type="text"
              value={message}
              maxLength={4000}
              autoComplete="off"
              placeholder="Type Hello Gexor"
              onChange={(event) => setMessage(event.target.value)}
              disabled={isSending}
            />

            <button
              type="submit"
              disabled={!message.trim() || isSending}
            >
              {isSending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>

        <footer>
          Provider-backed MVP chat interface.
        </footer>
      </section>
    </main>
  );
}
