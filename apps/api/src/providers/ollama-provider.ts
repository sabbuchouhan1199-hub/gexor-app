import {
  ProviderError,
} from "./errors.js";
import type {
  GenerateTextRequest,
  GenerateTextResult,
  TextProvider,
} from "./provider.js";

type FetchImplementation = typeof fetch;

export type OllamaProviderOptions = {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: FetchImplementation;
};

type OllamaPayload = {
  model?: unknown;
  message?: {
    role?: unknown;
    content?: unknown;
  };
  done?: unknown;
};

const DEFAULT_BASE_URL =
  "http://127.0.0.1:11434";

const DEFAULT_TIMEOUT_MS = 120_000;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function mapHttpError(status: number): ProviderError {
  if (status === 404) {
    return new ProviderError({
      code: "PROVIDER_MODEL_NOT_FOUND",
      message:
        "The configured Ollama model is not installed.",
      status: 503,
      retryable: false,
    });
  }

  return new ProviderError({
    code: "PROVIDER_UNAVAILABLE",
    message:
      "The local Ollama provider is unavailable.",
    status: 503,
    retryable: status >= 500,
  });
}

export class OllamaProvider implements TextProvider {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: OllamaProviderOptions) {
    const model = options.model.trim();

    if (model.length === 0) {
      throw new Error(
        "Ollama provider requires a model name.",
      );
    }

    const baseUrl = normalizeBaseUrl(
      options.baseUrl ?? DEFAULT_BASE_URL,
    );

    if (baseUrl.length === 0) {
      throw new Error(
        "Ollama provider requires a base URL.",
      );
    }

    const timeoutMs =
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1
    ) {
      throw new Error(
        "Ollama timeout must be a positive integer.",
      );
    }

    this.model = model;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fetchImplementation =
      options.fetchImplementation ?? fetch;
  }

  async *streamText(request: GenerateTextRequest) {
    const input = request.input.trim();
    if (!input) throw new Error("Provider input must not be empty.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = request.signal ? AbortSignal.any([controller.signal, request.signal]) : controller.signal;
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: input }], stream: true, think: false }),
        signal,
      });
      if (!response.ok) throw mapHttpError(response.status);
      if (!response.body) throw new ProviderError({ code: "PROVIDER_INVALID_RESPONSE", message: "Ollama returned no response stream.", status: 502, retryable: false });
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let text = ""; let completed = false;
      while (true) {
        const item = await reader.read(); buffer += decoder.decode(item.value, { stream: !item.done });
        const lines = buffer.split("\n"); buffer = item.done ? "" : lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let payload: OllamaPayload;
          try { payload = JSON.parse(line) as OllamaPayload; } catch { throw new ProviderError({ code: "PROVIDER_INVALID_RESPONSE", message: "Ollama returned invalid stream data.", status: 502, retryable: false }); }
          const delta = typeof payload.message?.content === "string" ? payload.message.content : "";
          if (delta) { text += delta; yield { provider: "ollama", model: typeof payload.model === "string" ? payload.model : this.model, delta, done: false }; }
          if (payload.done === true) completed = true;
        }
        if (item.done) break;
      }
      if (!completed || !text.trim()) throw new ProviderError({ code: "PROVIDER_INVALID_RESPONSE", message: "Ollama returned an incomplete stream.", status: 502, retryable: false });
      yield { provider: "ollama", model: this.model, delta: "", done: true };
    } catch (error) {
      if (request.signal?.aborted) throw error;
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new ProviderError({ code: "PROVIDER_TIMEOUT", message: "The local Ollama request timed out.", status: 504, retryable: true });
      throw new ProviderError({ code: "PROVIDER_UNAVAILABLE", message: "The local Ollama server could not be reached.", status: 503, retryable: true });
    } finally { clearTimeout(timeout); }
  }

  async generateText(
    request: GenerateTextRequest,
  ): Promise<GenerateTextResult> {
    const input = request.input.trim();

    if (input.length === 0) {
      throw new Error(
        "Provider input must not be empty.",
      );
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    try {
      const response = await this.fetchImplementation(
        `${this.baseUrl}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: "user",
                content: input,
              },
            ],
            stream: false,
            think: false,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw mapHttpError(response.status);
      }

      let payload: OllamaPayload;

      try {
        payload =
          (await response.json()) as OllamaPayload;
      } catch {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message:
            "Ollama returned invalid JSON.",
          status: 502,
          retryable: false,
        });
      }

      const text =
        typeof payload.message?.content === "string"
          ? payload.message.content.trim()
          : "";

      if (text.length === 0) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message:
            "Ollama returned no usable text.",
          status: 502,
          retryable: false,
        });
      }

      return {
        provider: "ollama",
        model:
          typeof payload.model === "string"
            ? payload.model
            : this.model,
        text,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        throw new ProviderError({
          code: "PROVIDER_TIMEOUT",
          message:
            "The local Ollama request timed out.",
          status: 504,
          retryable: true,
        });
      }

      throw new ProviderError({
        code: "PROVIDER_UNAVAILABLE",
        message:
          "The local Ollama server could not be reached.",
        status: 503,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}