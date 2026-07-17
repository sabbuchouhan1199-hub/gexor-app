export type ApiConfig = {
  host: string;
  port: number;
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
  const rawTimeout = value?.trim() || "120000";

  if (!/^\d+$/.test(rawTimeout)) {
    throw new Error("GEMINI_TIMEOUT_MS must be a positive whole number.");
  }

  const timeoutMs = Number(rawTimeout);

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("GEMINI_TIMEOUT_MS must be a positive whole number.");
  }

  return timeoutMs;
}

export function loadApiConfig(
  environment: Environment = process.env,
): ApiConfig {
  return {
    host: readHost(environment.HOST),
    port: readPort(environment.PORT),
    geminiApiKey: readOptionalValue(environment.GEMINI_API_KEY),
    geminiModel: readGeminiModel(environment.GEMINI_MODEL),
    geminiTimeoutMs: readGeminiTimeoutMs(environment.GEMINI_TIMEOUT_MS),
  };
}
