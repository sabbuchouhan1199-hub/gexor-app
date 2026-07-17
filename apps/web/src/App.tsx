import {
  type FormEvent,
  useState,
} from "react";

import type {
  ChatRequest,
  ChatResponse,
} from "@gexor/contracts";

export function App() {
  const [message, setMessage] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedMessage = message.trim();

    if (!normalizedMessage || isSending) {
      return;
    }

    const requestBody: ChatRequest = {
      message: normalizedMessage,
    };

    setIsSending(true);
    setSubmittedMessage(normalizedMessage);
    setMessage("");
    setReply("");
    setError("");

    try {
      const response = await fetch("/mock/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API request failed with HTTP ${response.status}.`);
      }

      const responseBody = (await response.json()) as ChatResponse;

      setReply(responseBody.reply);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "An unexpected request error occurred.";

      setMessage(normalizedMessage);
      setError(message);
    } finally {
      setIsSending(false);
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
          Deterministic mock API
        </div>

        <div className="conversation" aria-live="polite">
          <article className="message message-system">
            <p className="message-label">Gexor</p>
            <p>
              Enter a message to verify the browser-to-API connection.
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
          Temporary MVP verification interface. No AI provider is connected.
        </footer>
      </section>
    </main>
  );
}
