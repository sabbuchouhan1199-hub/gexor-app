import { ProviderError } from "./errors.js";
import type {
  GenerateTextRequest,
  GenerateTextResult,
  TextProvider,
  GenerateTextChunk,
} from "./provider.js";

type FetchImplementation = typeof fetch;

export type LlamaCppProviderOptions = {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: FetchImplementation;
};

type OpenAiChatPayload = {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown };
    finish_reason?: unknown;
  }>;
  model?: unknown;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8080/v1";
const DEFAULT_TIMEOUT_MS = 120_000;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapHttpError(status: number): ProviderError {
  if (status === 400) {
    return new ProviderError({
      code: "PROVIDER_REQUEST_REJECTED",
      message: "The provider rejected the request.",
      status: 502,
      retryable: false,
    });
  }

  if (status === 401 || status === 403) {
    return new ProviderError({
      code: "PROVIDER_AUTHENTICATION_FAILED",
      message: "The provider rejected the configured credentials or permissions.",
      status: 502,
      retryable: false,
    });
  }

  if (status === 404) {
    return new ProviderError({
      code: "PROVIDER_MODEL_NOT_FOUND",
      message: "The configured provider model was not found.",
      status: 503,
      retryable: false,
    });
  }

  if (status === 429) {
    return new ProviderError({
      code: "PROVIDER_RATE_LIMITED",
      message: "The provider rate limit or quota was exceeded.",
      status: 503,
      retryable: true,
    });
  }

  if ([500, 502, 503, 504].includes(status)) {
    return new ProviderError({
      code: "PROVIDER_UNAVAILABLE",
      message: "The provider is unavailable.",
      status: 503,
      retryable: true,
    });
  }

  return new ProviderError({
    code: "PROVIDER_UNAVAILABLE",
    message: "The provider is unavailable.",
    status: 503,
    retryable: false,
  });
}

function parseSseEvent(frame: string): string | null {
  const lines = frame.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith(":")) {
      continue;
    }
    const colonIdx = line.indexOf(":");
    let field: string;
    let value: string;
    if (colonIdx !== -1) {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
    } else {
      field = line;
      value = "";
    }
    if (field === "data") {
      dataLines.push(value);
    }
  }
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

function getModelFromPayload(payload: unknown, configuredModel: string): string {
  if (isRecord(payload) && typeof payload.model === "string") {
    return payload.model;
  }
  return configuredModel;
}

export class LlamaCppProvider implements TextProvider {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: LlamaCppProviderOptions) {
    const model = options.model.trim();
    if (model.length === 0) {
      throw new Error("LlamaCpp provider requires a model name.");
    }

    const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    if (baseUrl.length === 0) {
      throw new Error("LlamaCpp provider requires a base URL.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error("LlamaCpp timeout must be a positive integer.");
    }

    this.model = model;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
    const input = request.input.trim();
    if (input.length === 0) {
      throw new Error("Provider input must not be empty.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        `${this.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: input }],
            stream: false,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw mapHttpError(response.status);
      }

      let payload: OpenAiChatPayload;
      try {
        payload = (await response.json()) as OpenAiChatPayload;
      } catch {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message: "The provider returned invalid JSON.",
          status: 502,
          retryable: false,
        });
      }

      const text =
        typeof payload.choices?.[0]?.message?.content === "string"
          ? payload.choices[0].message.content.trim()
          : "";

      if (text.length === 0) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message: "The provider returned no usable text.",
          status: 502,
          retryable: false,
        });
      }

      const resolvedModel = getModelFromPayload(payload, this.model);

      return {
        provider: "llama-cpp",
        model: resolvedModel,
        text,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError({
          code: "PROVIDER_TIMEOUT",
          message: "The provider request timed out.",
          status: 504,
          retryable: true,
        });
      }

      throw new ProviderError({
        code: "PROVIDER_UNAVAILABLE",
        message: "The provider could not be reached.",
        status: 503,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async *streamText(request: GenerateTextRequest): AsyncIterable<GenerateTextChunk> {
    const input = request.input.trim();
    if (!input) {
      throw new Error("Provider input must not be empty.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([controller.signal, request.signal])
      : controller.signal;

    try {
      const response = await this.fetchImplementation(
        `${this.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: input }],
            stream: true,
          }),
          signal,
        },
      );

      if (!response.ok) {
        throw mapHttpError(response.status);
      }

      if (!response.body) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message: "The provider returned no response stream.",
          status: 502,
          retryable: false,
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let yieldedContent = false;

      while (true) {
        const item = await reader.read();

        if (item.value) {
          buffer += decoder.decode(item.value, { stream: !item.done });
        } else if (item.done) {
          buffer += decoder.decode();
        }

        // Split SSE frames by double newline (CRLF or LF)
        const frames = buffer.split(/\r?\n\r?\n/);
        const lastFrame = frames.pop() ?? "";
        buffer = item.done ? "" : lastFrame;

        // If we're done and there's leftover content without trailing separator
        if (item.done && lastFrame.trim()) {
          frames.push(lastFrame);
        }

        for (const frame of frames) {
          const data = parseSseEvent(frame);
          if (data === null) continue;
          if (data === "[DONE]") continue;

          let payload: OpenAiChatPayload;
          try {
            payload = JSON.parse(data) as OpenAiChatPayload;
          } catch {
            throw new ProviderError({
              code: "PROVIDER_INVALID_RESPONSE",
              message: "The provider returned invalid stream data.",
              status: 502,
              retryable: false,
            });
          }

          const delta =
            typeof payload.choices?.[0]?.delta?.content === "string"
              ? payload.choices[0].delta.content
              : "";

          if (delta) {
            yieldedContent = true;
            text += delta;
            yield {
              provider: "llama-cpp",
              model: getModelFromPayload(payload, this.model),
              delta,
              done: false,
            };
          }
        }

        if (item.done) break;
      }

      if (!yieldedContent) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message: "The provider returned no usable streamed text.",
          status: 502,
          retryable: false,
        });
      }

      yield {
        provider: "llama-cpp",
        model: this.model,
        delta: "",
        done: true,
      };
    } catch (error) {
      if (request.signal?.aborted) throw error;
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError({
          code: "PROVIDER_TIMEOUT",
          message: "The provider request timed out.",
          status: 504,
          retryable: true,
        });
      }
      throw new ProviderError({
        code: "PROVIDER_UNAVAILABLE",
        message: "The provider could not be reached.",
        status: 503,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
