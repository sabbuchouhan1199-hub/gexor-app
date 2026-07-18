import {
  createHash,
  randomBytes,
} from "node:crypto";

import { AuthDomainError } from "./auth-errors.js";

export const SESSION_TOKEN_BYTES = 32;

export type SessionTokenGenerator = {
  generate(): string;
  hash(token: string): string;
};

export type OpaqueSessionTokenGeneratorOptions = {
  randomByteGenerator?: (size: number) => Uint8Array;
};

export class OpaqueSessionTokenGenerator implements SessionTokenGenerator {
  readonly #randomByteGenerator: (size: number) => Uint8Array;

  constructor(options: OpaqueSessionTokenGeneratorOptions = {}) {
    this.#randomByteGenerator = options.randomByteGenerator ?? randomBytes;
  }

  generate(): string {
    const bytes = Buffer.from(this.#randomByteGenerator(SESSION_TOKEN_BYTES));
    if (bytes.length < SESSION_TOKEN_BYTES) {
      throw new AuthDomainError("SESSION_TOKEN_GENERATION_FAILED");
    }
    return bytes.toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}
