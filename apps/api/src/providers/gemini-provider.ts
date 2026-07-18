import { ProviderError } from "./errors.js";
import type {
  GenerateTextRequest,
  GenerateTextResult,
  TextProvider,
} from "./provider.js";

type FetchImplementation = typeof fetch;

export type GeminiProviderOptions = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImplementation?: FetchImplementation;
};

type GeminiPayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: unknown }>;
    };
  }>;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const INVALID_API_KEY_REASONS = new Set([
  "API_KEY_INVALID",
  "API_KEY_NOT_VALID",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function hasStructuredInvalidApiKey(response: Response): Promise<boolean> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return false;
  }

  if (!isRecord(payload) || !isRecord(payload.error)) return false;
  const error = payload.error;
  const reasons: unknown[] = [error.reason];

  if (Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (!isRecord(detail)) continue;
      reasons.push(detail.reason);
      if (isRecord(detail.metadata)) reasons.push(detail.metadata.reason);
    }
  }

  return reasons.some(
    (reason) => typeof reason === "string" && INVALID_API_KEY_REASONS.has(reason),
  );
}

function mapHttpError(status: number, invalidApiKey = false): ProviderError {
  if (status === 401 || status === 403 || (status === 400 && invalidApiKey)) {
    return new ProviderError({
      code: "PROVIDER_AUTHENTICATION_FAILED",
      message:
        "The provider rejected the configured credentials or permissions.",
      status: 502,
      retryable: false,
    });
  }

  if (status === 400) {
    return new ProviderError({
      code: "PROVIDER_REQUEST_REJECTED",
      message: "The provider rejected the request.",
      status: 502,
      retryable: false,
    });
  }

  if (status === 404) {
    return new ProviderError({
      code: "PROVIDER_MODEL_NOT_FOUND",
      message:
        "The configured provider model was not found.",
      status: 503,
      retryable: false,
    });
  }

  if (status === 429) {
    return new ProviderError({
      code: "PROVIDER_RATE_LIMITED",
      message:
        "The provider rate limit or quota was exceeded.",
      status: 503,
      retryable: true,
    });
  }

  return new ProviderError({
    code: "PROVIDER_UNAVAILABLE",
    message: "The provider is unavailable.",
    status: 503,
    retryable: [500, 502, 503, 504].includes(status),
  });
}

export class GeminiProvider implements TextProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: GeminiProviderOptions) {
    const apiKey = options.apiKey.trim();
    const model = options.model.trim();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (apiKey.length === 0) {
      throw new Error("Gemini provider requires an API key.");
    }
    if (model.length === 0) {
      throw new Error("Gemini provider requires a model name.");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error("Gemini timeout must be a positive integer.");
    }

    this.apiKey = apiKey;
    this.model = model;
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
        `${BASE_URL}/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: input }] }],
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const invalidApiKey = response.status === 400
          ? await hasStructuredInvalidApiKey(response)
          : false;
        throw mapHttpError(response.status, invalidApiKey);
      }

      let payload: GeminiPayload;
      try {
        payload = (await response.json()) as GeminiPayload;
      } catch {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message: "The provider returned invalid JSON.",
          status: 502,
          retryable: false,
        });
      }

      const text = payload.candidates?.[0]?.content?.parts
        ?.flatMap((part) =>
          typeof part.text === "string" ? [part.text.trim()] : [],
        )
        .filter(Boolean)
        .join("\n") ?? "";

      if (text.length === 0) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          message: "The provider returned no usable text.",
          status: 502,
          retryable: false,
        });
      }

      return {
        provider: "gemini",
        model: this.model,
        text,
      };
    } catch (error) {
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
