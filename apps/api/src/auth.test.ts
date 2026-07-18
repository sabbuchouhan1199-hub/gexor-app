import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  AuthenticationResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from "@gexor/contracts";

import { AuthDomainError } from "./auth/auth-errors.js";
import {
  MAX_EMAIL_LENGTH,
  normalizeEmail,
} from "./auth/email.js";
import {
  PasswordHasher,
  SCRYPT_PASSWORD_PARAMETERS,
} from "./auth/password-hasher.js";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from "./auth/password-policy.js";
import {
  DEFAULT_USER_STATUS,
  MAX_DISPLAY_NAME_LENGTH,
  normalizeDisplayName,
  toAuthenticatedUser,
  type UserIdentityRecord,
} from "./auth/user-identity.js";

test("email normalization trims, lowercases, and produces stable lookup values", () => {
  assert.equal(normalizeEmail("  Person@Example.COM  "), "person@example.com");
  assert.equal(
    normalizeEmail("Person@Example.COM"),
    normalizeEmail("person@example.com"),
  );
});

test("email normalization preserves dots and plus tags without provider rewriting", () => {
  assert.equal(
    normalizeEmail("First.Last+tag@Gmail.COM"),
    "first.last+tag@gmail.com",
  );
});

test("email normalization rejects blank, malformed, whitespace, and excessive values", () => {
  const invalidValues = [
    "",
    "   ",
    "missing-at.example.com",
    "a@@example.com",
    "@example.com",
    "person@",
    "person @example.com",
    ".person@example.com",
    "person..name@example.com",
    "person@example",
    "person@-example.com",
    "person@example..com",
    `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`,
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => normalizeEmail(value),
      (error: unknown) =>
        error instanceof AuthDomainError
        && error.code === "INVALID_EMAIL"
        && (value.length === 0 || !error.message.includes(value)),
    );
  }
});

test("password policy enforces length boundaries without composition rules", () => {
  assert.throws(
    () => validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1)),
    { name: "AuthDomainError" },
  );
  assert.doesNotThrow(() => validatePassword("a".repeat(MIN_PASSWORD_LENGTH)));
  assert.doesNotThrow(() => validatePassword("a".repeat(MAX_PASSWORD_LENGTH)));
  assert.throws(
    () => validatePassword("a".repeat(MAX_PASSWORD_LENGTH + 1)),
    { name: "AuthDomainError" },
  );
});

test("password policy preserves Unicode and intentional surrounding spaces", () => {
  assert.doesNotThrow(() => validatePassword("🔐".repeat(MIN_PASSWORD_LENGTH)));
  assert.doesNotThrow(() => validatePassword("  intentional spacing  "));
});

test("password policy rejects all-whitespace and embedded-null inputs safely", () => {
  for (const value of [" ".repeat(MIN_PASSWORD_LENGTH), `valid-length\0value`]) {
    assert.throws(
      () => validatePassword(value),
      (error: unknown) =>
        error instanceof AuthDomainError
        && error.code === "PASSWORD_POLICY_VIOLATION"
        && (value.length === 0 || !error.message.includes(value)),
    );
  }
});

test("password hashes are versioned, parameterized, salted, and verifiable", async () => {
  const hasher = new PasswordHasher();
  const input = "synthetic-input-value";
  const first = await hasher.hash(input);
  const second = await hasher.hash(input);

  assert.match(
    first,
    /^scrypt\$v1\$N=16384,r=8,p=1,l=64\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
  );
  assert.equal(first.includes(input), false);
  assert.notEqual(first, second);
  assert.equal(await hasher.verify(input, first), true);
  assert.equal(await hasher.verify("different-input-value", first), false);
  assert.deepEqual(SCRYPT_PASSWORD_PARAMETERS, {
    cost: 16_384,
    blockSize: 8,
    parallelization: 1,
    keyLength: 64,
    saltLength: 16,
    maxMemory: 64 * 1024 * 1024,
  });
});

test("injected salt makes password hash encoding deterministic", async () => {
  const hasher = new PasswordHasher({
    saltGenerator: () => Buffer.alloc(16, 7),
  });
  const input = "deterministic-input";
  assert.equal(await hasher.hash(input), await hasher.hash(input));
});

test("malformed and unsupported password hashes fail safely", async () => {
  const hasher = new PasswordHasher();
  const valid = await hasher.hash("synthetic-input-value");
  const fields = valid.split("$");
  const malformedValues = [
    "",
    "not-an-encoded-value",
    valid.replace("$v1$", "$v2$"),
    [fields[0], fields[1], fields[2], fields[3], Buffer.alloc(8).toString("base64url")].join("$"),
  ];

  for (const value of malformedValues) {
    assert.equal(await hasher.verify("synthetic-input-value", value), false);
  }
});

test("password hashing failures use controlled messages", async () => {
  const input = "synthetic-input-value";
  const hasher = new PasswordHasher({
    deriveKey: async () => {
      throw new Error(`unsafe ${input}`);
    },
  });

  await assert.rejects(
    hasher.hash(input),
    (error: unknown) =>
      error instanceof AuthDomainError
      && error.code === "PASSWORD_HASHING_FAILED"
      && !error.message.includes(input),
  );
});

test("display names normalize safely and enforce boundaries", () => {
  assert.equal(normalizeDisplayName("  Example User  "), "Example User");
  assert.equal(
    normalizeDisplayName("界".repeat(MAX_DISPLAY_NAME_LENGTH)),
    "界".repeat(MAX_DISPLAY_NAME_LENGTH),
  );
  for (const value of ["", "   ", "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1), "valid\0name"]) {
    assert.throws(
      () => normalizeDisplayName(value),
      (error: unknown) =>
        error instanceof AuthDomainError
        && error.code === "INVALID_DISPLAY_NAME"
        && (value.length === 0 || !error.message.includes(value)),
    );
  }
  assert.equal(DEFAULT_USER_STATUS, "active");
});

test("public user snapshots are defensive and exclude internal identity fields", () => {
  const identity: UserIdentityRecord = {
    userId: "user_test",
    email: "person@example.com",
    normalizedEmail: "person@example.com",
    displayName: "Example User",
    status: "active",
    passwordHash: "internal-only-synthetic-hash",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };

  const snapshot = toAuthenticatedUser(identity);
  assert.deepEqual(snapshot, {
    userId: "user_test",
    email: "person@example.com",
    displayName: "Example User",
    status: "active",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  });
  assert.equal("passwordHash" in snapshot, false);
  assert.equal("normalizedEmail" in snapshot, false);

  snapshot.displayName = "Changed";
  assert.equal(identity.displayName, "Example User");
});

test("password hashing preserves intentional surrounding spaces", async () => {
  const hasher = new PasswordHasher({
    saltGenerator: () => Buffer.alloc(16, 5),
  });
  const input = "  intentional spacing  ";
  const encoded = await hasher.hash(input);
  assert.equal(await hasher.verify(input, encoded), true);
  assert.equal(await hasher.verify(input.trim(), encoded), false);
});

test("shared authentication transport contracts compile with safe public shapes", () => {
  const registerRequest: RegisterRequest = {
    displayName: "Example User",
    email: "person@example.com",
    password: "synthetic-request-input",
  };
  const loginRequest: LoginRequest = {
    email: registerRequest.email,
    password: registerRequest.password,
  };
  const response: AuthenticationResponse = {
    user: {
      userId: "user_test",
      email: registerRequest.email,
      displayName: registerRequest.displayName,
      status: "active",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    },
    sessionToken: "synthetic-one-time-token",
    session: {
      sessionId: "session_test",
      userId: "user_test",
      status: "active",
      createdAt: "2026-07-18T00:00:00.000Z",
      expiresAt: "2026-07-19T00:00:00.000Z",
      lastSeenAt: "2026-07-18T00:00:00.000Z",
    },
  };
  const registerResponse: RegisterResponse = response;
  const loginResponse: LoginResponse = response;

  assert.equal(loginRequest.email, registerRequest.email);
  assert.equal(registerResponse.user.userId, loginResponse.session.userId);
  assert.equal("passwordHash" in response.user, false);
  assert.equal("tokenHash" in response.session, false);
  assert.equal(typeof response.sessionToken, "string");
});
