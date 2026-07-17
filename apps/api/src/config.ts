export type TextProviderName =
  | "ollama"
  | "gemini";

export type ApiConfig = {
  host: string;
  port: number;
  textProvider: TextProviderName;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  geminiApiKey?: string;
  geminiModel: string;
  geminiTimeoutMs: number;
};

type Environment = Record<string, string | undefined>;

function readHost(value: string | undefined): string {
  const host = value?.trim() || "127.0.0.1";

  if (host.length === 0) {
    throw new Error("HOST must not be empty.");
  }

  return host;
}

function readPort(value: string | undefined): number {
  const rawPort = value?.trim() || "3001";

  if (!/^\d+$/.test(rawPort)) {
    throw new Error(
      "PORT must be a whole number between 1 and 65535.",
    );
  }

  const port = Number(rawPort);

  if (
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "PORT must be a whole number between 1 and 65535.",
    );
  }

  return port;
}

function readOptionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readTextProvider(
  value: string | undefined,
): TextProviderName {
  if (value === undefined) {
    return "ollama";
  }

  const provider = value.trim();

  if (
    provider !== "ollama" &&
    provider !== "gemini"
  ) {
    throw new Error(
      'TEXT_PROVIDER must be either "ollama" or "gemini".',
    );
  }

  return provider;
}

function readRequiredValue(
  value: string | undefined,
  defaultValue: string,
  variableName: string,
): string {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(
      `${variableName} must not be empty.`,
    );
  }

  return normalized;
}

function readPositiveWholeNumber(
  value: string | undefined,
  defaultValue: string,
  variableName: string,
): number {
  const rawValue =
    value === undefined ? defaultValue : value.trim();

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(
      `${variableName} must be a positive whole number.`,
    );
  }

  const number = Number(rawValue);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw new Error(
      `${variableName} must be a positive whole number.`,
    );
  }

  return number;
}

function readGeminiModel(value: string | undefined): string {
  if (value === undefined) {
    return "gemini-2.5-flash-lite";
  }

  const model = value.trim();

  if (model.length === 0) {
    throw new Error("GEMINI_MODEL must not be empty.");
  }

  return model;
}

function readGeminiTimeoutMs(value: string | undefined): number {
  return readPositiveWholeNumber(
    value,
    "120000",
    "GEMINI_TIMEOUT_MS",
  );
}

export function loadApiConfig(
  environment: Environment = process.env,
): ApiConfig {
  return {
    host: readHost(environment.HOST),
    port: readPort(environment.PORT),
    textProvider: readTextProvider(
      environment.TEXT_PROVIDER,
    ),
    ollamaBaseUrl: readRequiredValue(
      environment.OLLAMA_BASE_URL,
      "http://127.0.0.1:11434",
      "OLLAMA_BASE_URL",
    ),
    ollamaModel: readRequiredValue(
      environment.OLLAMA_MODEL,
      "qwen3:0.6b",
      "OLLAMA_MODEL",
    ),
    ollamaTimeoutMs: readPositiveWholeNumber(
      environment.OLLAMA_TIMEOUT_MS,
      "120000",
      "OLLAMA_TIMEOUT_MS",
    ),
    geminiApiKey: readOptionalValue(environment.GEMINI_API_KEY),
    geminiModel: readGeminiModel(environment.GEMINI_MODEL),
    geminiTimeoutMs: readGeminiTimeoutMs(environment.GEMINI_TIMEOUT_MS),
  };
}
