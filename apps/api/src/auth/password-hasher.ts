import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

import { AuthDomainError } from "./auth-errors.js";
import { validatePassword } from "./password-policy.js";

const ALGORITHM = "scrypt";
const VERSION = "v1";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
const PARAMETER_FIELD =
  `N=${COST},r=${BLOCK_SIZE},p=${PARALLELIZATION},l=${KEY_LENGTH}`;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

// These explicit parameters make stored credentials self-describing and upgradeable.
// They are implementation settings, not a claim of suitability for every deployment.
export const SCRYPT_PASSWORD_PARAMETERS = {
  cost: COST,
  blockSize: BLOCK_SIZE,
  parallelization: PARALLELIZATION,
  keyLength: KEY_LENGTH,
  saltLength: SALT_LENGTH,
  maxMemory: MAX_MEMORY,
} as const;

type DeriveKeyOptions = {
  cost: number;
  blockSize: number;
  parallelization: number;
  maxMemory: number;
};

export type PasswordKeyDeriver = (
  password: string,
  salt: Uint8Array,
  keyLength: number,
  options: DeriveKeyOptions,
) => Promise<Uint8Array>;

export type PasswordHasherOptions = {
  saltGenerator?: () => Uint8Array;
  deriveKey?: PasswordKeyDeriver;
};

const scryptOptions: ScryptOptions = {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELIZATION,
  maxmem: MAX_MEMORY,
};

async function deriveWithScrypt(
  password: string,
  salt: Uint8Array,
  keyLength: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export class PasswordHasher {
  readonly #saltGenerator: () => Uint8Array;
  readonly #deriveKey: PasswordKeyDeriver;

  constructor(options: PasswordHasherOptions = {}) {
    this.#saltGenerator = options.saltGenerator
      ?? (() => randomBytes(SALT_LENGTH));
    this.#deriveKey = options.deriveKey
      ?? ((password, salt, keyLength) =>
        deriveWithScrypt(password, salt, keyLength));
  }

  async hash(password: string): Promise<string> {
    validatePassword(password);

    try {
      const salt = Buffer.from(this.#saltGenerator());
      if (salt.length !== SALT_LENGTH) {
        throw new Error("Invalid salt length.");
      }

      const derivedKey = Buffer.from(await this.#deriveKey(
        password,
        salt,
        KEY_LENGTH,
        {
          cost: COST,
          blockSize: BLOCK_SIZE,
          parallelization: PARALLELIZATION,
          maxMemory: MAX_MEMORY,
        },
      ));
      if (derivedKey.length !== KEY_LENGTH) {
        throw new Error("Invalid derived-key length.");
      }

      return [
        ALGORITHM,
        VERSION,
        PARAMETER_FIELD,
        salt.toString("base64url"),
        derivedKey.toString("base64url"),
      ].join("$");
    } catch {
      throw new AuthDomainError("PASSWORD_HASHING_FAILED");
    }
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = parseEncodedHash(encodedHash);
    if (!parsed) return false;

    try {
      const candidate = Buffer.from(await this.#deriveKey(
        password,
        parsed.salt,
        KEY_LENGTH,
        {
          cost: COST,
          blockSize: BLOCK_SIZE,
          parallelization: PARALLELIZATION,
          maxMemory: MAX_MEMORY,
        },
      ));
      if (candidate.length !== parsed.derivedKey.length) return false;
      return timingSafeEqual(candidate, parsed.derivedKey);
    } catch {
      return false;
    }
  }
}

function parseEncodedHash(
  encodedHash: string,
): { salt: Buffer; derivedKey: Buffer } | undefined {
  const fields = encodedHash.split("$");
  if (
    fields.length !== 5
    || fields[0] !== ALGORITHM
    || fields[1] !== VERSION
    || fields[2] !== PARAMETER_FIELD
    || !BASE64URL_PATTERN.test(fields[3] ?? "")
    || !BASE64URL_PATTERN.test(fields[4] ?? "")
  ) {
    return undefined;
  }

  const salt = Buffer.from(fields[3]!, "base64url");
  const derivedKey = Buffer.from(fields[4]!, "base64url");
  if (salt.length !== SALT_LENGTH || derivedKey.length !== KEY_LENGTH) {
    return undefined;
  }

  return { salt, derivedKey };
}
