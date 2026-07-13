export type ProviderErrorCode =
  | "PROVIDER_MODEL_NOT_FOUND"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_INVALID_RESPONSE";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(options: {
    code: ProviderErrorCode;
    message: string;
    status: number;
    retryable: boolean;
  }) {
    super(options.message);

    this.name = "ProviderError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable;
  }
}