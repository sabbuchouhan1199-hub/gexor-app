import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthDomainError } from "./auth/auth-errors.js";
import {
  InMemoryIdentityRepository,
  type IdentityRepository,
} from "./auth/identity-repository.js";
import {
  IdentityService,
  type PasswordHashingService,
} from "./auth/identity-service.js";

function repositoryFixture() {
  let now = new Date("2026-07-18T10:00:00.000Z");
  const repository = new InMemoryIdentityRepository({
    now: () => now,
    createId: () => "identity-1",
  });
  return {
    repository,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

const createInput = {
  email: "person@example.com",
  normalizedEmail: "person@example.com",
  displayName: "Example User",
  passwordHash: "scrypt-v1-synthetic-hash",
};

test("identity repository creates deterministic active users and internal credentials", async () => {
  const { repository } = repositoryFixture();
  const user = await repository.create(createInput);
  assert.deepEqual(user, {
    userId: "user_identity-1",
    email: "person@example.com",
    displayName: "Example User",
    status: "active",
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:00.000Z",
  });
  assert.equal("passwordHash" in user, false);
  assert.equal("normalizedEmail" in user, false);

  const credentials = await repository.findCredentialsByNormalizedEmail(
    "person@example.com",
  );
  assert.equal(credentials?.normalizedEmail, "person@example.com");
  assert.equal(credentials?.passwordHash, createInput.passwordHash);
  assert.equal(JSON.stringify(credentials).includes("raw-input-value"), false);
});

test("identity repository rejects canonical duplicate email variants", async () => {
  const { repository } = repositoryFixture();
  await repository.create(createInput);
  await assert.rejects(
    repository.create({
      ...createInput,
      email: "  PERSON@EXAMPLE.COM ",
      normalizedEmail: " person@example.com ",
    }),
    (error: unknown) =>
      error instanceof AuthDomainError
      && error.code === "DUPLICATE_EMAIL"
      && !error.message.includes("person@example.com"),
  );
});

test("identity repository returns defensive public and credential copies", async () => {
  const { repository } = repositoryFixture();
  const created = await repository.create(createInput);
  created.displayName = "Changed";

  const found = await repository.findById(created.userId);
  assert.equal(found?.displayName, "Example User");

  const credentials = await repository.findCredentialsByNormalizedEmail(
    createInput.normalizedEmail,
  );
  assert.ok(credentials);
  credentials.passwordHash = "changed";
  credentials.normalizedEmail = "changed@example.com";

  const foundAgain = await repository.findCredentialsByNormalizedEmail(
    createInput.normalizedEmail,
  );
  assert.equal(foundAgain?.passwordHash, createInput.passwordHash);
  assert.equal(foundAgain?.normalizedEmail, createInput.normalizedEmail);
});

test("identity repository updates status and handles unknown users", async () => {
  const fixture = repositoryFixture();
  const created = await fixture.repository.create(createInput);
  fixture.setNow("2026-07-18T11:00:00.000Z");

  const disabled = await fixture.repository.setStatus(created.userId, "disabled");
  assert.equal(disabled?.status, "disabled");
  assert.equal(disabled?.updatedAt, "2026-07-18T11:00:00.000Z");
  assert.equal(await fixture.repository.findById("user_unknown"), undefined);
  assert.equal(
    await fixture.repository.setStatus("user_unknown", "disabled"),
    undefined,
  );
});

class FakePasswordHasher implements PasswordHashingService {
  readonly verifyCalls: Array<{ encodedHash: string }> = [];

  async hash(_password: string): Promise<string> {
    return "encoded-created-hash";
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    this.verifyCalls.push({ encodedHash });
    return password === "accepted-input" && encodedHash === "encoded-created-hash";
  }
}

async function serviceFixture() {
  const repository = new InMemoryIdentityRepository({
    now: () => new Date("2026-07-18T10:00:00.000Z"),
    createId: () => "service-user",
  });
  const passwordHasher = new FakePasswordHasher();
  const service = new IdentityService({
    repository,
    passwordHasher,
    syntheticPasswordHash: "encoded-synthetic-hash",
  });
  const user = await service.createIdentity({
    displayName: "  Service User  ",
    email: "  SERVICE@Example.COM ",
    password: "accepted-input",
  });
  return { repository, passwordHasher, service, user };
}

test("identity service creates normalized identities through the hasher", async () => {
  const { repository, user } = await serviceFixture();
  assert.equal(user.email, "service@example.com");
  assert.equal(user.displayName, "Service User");
  const credentials = await repository.findCredentialsByNormalizedEmail(
    "service@example.com",
  );
  assert.equal(credentials?.passwordHash, "encoded-created-hash");
  assert.equal(JSON.stringify(credentials).includes("accepted-input"), false);
  assert.equal("passwordHash" in user, false);
});

test("identity service verifies valid credentials without creating sessions", async () => {
  const { service, user } = await serviceFixture();
  const authenticated = await service.verifyCredentials(
    " SERVICE@example.com ",
    "accepted-input",
  );
  assert.deepEqual(authenticated, user);
  assert.equal("session" in authenticated, false);
  assert.equal("sessionToken" in authenticated, false);
});

test("wrong and unknown credentials share one controlled classification", async () => {
  const { passwordHasher, service } = await serviceFixture();
  for (const [email, input] of [
    ["service@example.com", "rejected-input"],
    ["unknown@example.com", "accepted-input"],
    ["malformed", "accepted-input"],
  ]) {
    await assert.rejects(
      service.verifyCredentials(email, input),
      (error: unknown) =>
        error instanceof AuthDomainError
        && error.code === "INVALID_CREDENTIALS"
        && !error.message.includes(email)
        && !error.message.includes(input),
    );
  }
  assert.equal(
    passwordHasher.verifyCalls.some(
      (call) => call.encodedHash === "encoded-synthetic-hash",
    ),
    true,
  );
});

test("identity service rejects a disabled user after credential verification", async () => {
  const { repository, service, user } = await serviceFixture();
  await repository.setStatus(user.userId, "disabled");
  await assert.rejects(
    service.verifyCredentials("service@example.com", "accepted-input"),
    (error: unknown) =>
      error instanceof AuthDomainError
      && error.code === "USER_DISABLED"
      && !error.message.includes("accepted-input"),
  );
});
