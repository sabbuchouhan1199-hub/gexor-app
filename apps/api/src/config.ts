export type ApiConfig = {
  host: string;
  port: number;
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

export function loadApiConfig(
  environment: Environment = process.env,
): ApiConfig {
  return {
    host: readHost(environment.HOST),
    port: readPort(environment.PORT),
  };
}
