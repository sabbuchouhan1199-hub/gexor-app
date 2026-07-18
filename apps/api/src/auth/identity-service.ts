import type {
  AuthenticatedUser,
  RegisterRequest,
} from "@gexor/contracts";

import { AuthDomainError } from "./auth-errors.js";
import { normalizeEmail } from "./email.js";
import type { IdentityRepository } from "./identity-repository.js";
import { normalizeDisplayName, toAuthenticatedUser } from "./user-identity.js";

export type PasswordHashingService = {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
};

export type IdentityServiceOptions = {
  repository: IdentityRepository;
  passwordHasher: PasswordHashingService;
  syntheticPasswordHash: string;
};

export class IdentityService {
  readonly #repository: IdentityRepository;
  readonly #passwordHasher: PasswordHashingService;
  readonly #syntheticPasswordHash: string;

  constructor(options: IdentityServiceOptions) {
    if (options.syntheticPasswordHash.length === 0) {
      throw new AuthDomainError("MALFORMED_PASSWORD_HASH");
    }
    this.#repository = options.repository;
    this.#passwordHasher = options.passwordHasher;
    this.#syntheticPasswordHash = options.syntheticPasswordHash;
  }

  async createIdentity(input: RegisterRequest): Promise<AuthenticatedUser> {
    const normalizedEmail = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    const passwordHash = await this.#passwordHasher.hash(input.password);

    return this.#repository.create({
      email: normalizedEmail,
      normalizedEmail,
      displayName,
      passwordHash,
    });
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    let normalizedEmail: string | undefined;
    try {
      normalizedEmail = normalizeEmail(email);
    } catch {
      normalizedEmail = undefined;
    }

    const credentials = normalizedEmail
      ? await this.#repository.findCredentialsByNormalizedEmail(normalizedEmail)
      : undefined;
    const passwordHash = credentials?.passwordHash ?? this.#syntheticPasswordHash;
    const passwordMatches = await this.#passwordHasher.verify(password, passwordHash);

    if (!credentials || !passwordMatches) {
      throw new AuthDomainError("INVALID_CREDENTIALS");
    }
    if (credentials.status === "disabled") {
      throw new AuthDomainError("USER_DISABLED");
    }

    return toAuthenticatedUser(credentials);
  }
}
