import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_SESSION_LIFETIME_MS,
  InMemorySessionRepository,
} from "./auth/session-repository.js";
import {
  OpaqueSessionTokenGenerator,
  SESSION_TOKEN_BYTES,
  type SessionTokenGenerator,
} from "./auth/session-token.js";

test("opaque session tokens are random-data-only and hash deterministically", () => {
  const generator = new OpaqueSessionTokenGenerator({
    randomByteGenerator: (size) => Buffer.alloc(size, 9),
  });
  const token = generator.generate();
  const tokenHash = generator.hash(token);

  assert.equal(SESSION_TOKEN_BYTES, 32);
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.equal(token.includes("user_test"), false);
  assert.notEqual(tokenHash, token);
  assert.equal(generator.hash(token), tokenHash);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
});

class SequenceTokenGenerator implements SessionTokenGenerator {
  readonly #tokens: string[];
  readonly #hasher = new OpaqueSessionTokenGenerator({
    randomByteGenerator: (size) => Buffer.alloc(size, 1),
  });

  constructor(tokens: string[]) {
    this.#tokens = [...tokens];
  }

  generate(): string {
    const token = this.#tokens.shift();
    if (!token) throw new Error("Synthetic token sequence exhausted.");
    return token;
  }

  hash(token: string): string {
    return this.#hasher.hash(token);
  }
}

function sessionFixture(options: { lifetimeMs?: number } = {}) {
  let now = new Date("2026-07-18T10:00:00.000Z");
  const ids = ["one", "two", "three", "four"];
  const tokens = [
    "opaque-token-one",
    "opaque-token-two",
    "opaque-token-three",
    "opaque-token-four",
  ];
  const repository = new InMemorySessionRepository({
    now: () => now,
    createId: () => ids.shift() ?? "extra",
    tokenGenerator: new SequenceTokenGenerator(tokens),
    ...(options.lifetimeMs ? { lifetimeMs: options.lifetimeMs } : {}),
  });
  return {
    repository,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

test("session repository creates deterministic active sessions with default lifetime", async () => {
  const { repository } = sessionFixture();
  const created = await repository.create("user_test");

  assert.equal(created.sessionToken, "opaque-token-one");
  assert.deepEqual(created.session, {
    sessionId: "session_one",
    userId: "user_test",
    status: "active",
    createdAt: "2026-07-18T10:00:00.000Z",
    expiresAt: "2026-07-19T10:00:00.000Z",
    lastSeenAt: "2026-07-18T10:00:00.000Z",
  });
  assert.equal(DEFAULT_SESSION_LIFETIME_MS, 86_400_000);
  assert.equal("tokenHash" in created.session, false);
  assert.equal("sessionToken" in created.session, false);
  assert.equal(JSON.stringify(created).match(/opaque-token-one/g)?.length, 1);
});

test("session repository supports configurable lifetime and safe inspection", async () => {
  const { repository } = sessionFixture({ lifetimeMs: 60_000 });
  const created = await repository.create("user_test");
  assert.equal(created.session.expiresAt, "2026-07-18T10:01:00.000Z");

  const inspected = await repository.inspectById(created.session.sessionId);
  assert.deepEqual(inspected, created.session);
  assert.equal(inspected && "tokenHash" in inspected, false);
});

test("session lookup distinguishes valid, unknown, expired, and revoked", async () => {
  const fixture = sessionFixture();
  const created = await fixture.repository.create("user_test");
  assert.equal(
    (await fixture.repository.findValidByToken(created.sessionToken)).outcome,
    "valid",
  );
  assert.deepEqual(
    await fixture.repository.findValidByToken("unknown-token"),
    { outcome: "unknown" },
  );

  fixture.setNow("2026-07-19T10:00:00.000Z");
  assert.deepEqual(
    await fixture.repository.findValidByToken(created.sessionToken),
    { outcome: "expired" },
  );

  const secondFixture = sessionFixture();
  const second = await secondFixture.repository.create("user_test");
  await secondFixture.repository.revoke(second.session.sessionId);
  assert.deepEqual(
    await secondFixture.repository.findValidByToken(second.sessionToken),
    { outcome: "revoked" },
  );
});

test("touch updates only valid sessions and returns defensive summaries", async () => {
  const fixture = sessionFixture();
  const created = await fixture.repository.create("user_test");
  fixture.setNow("2026-07-18T11:00:00.000Z");

  const touched = await fixture.repository.touch(created.sessionToken);
  assert.equal(touched.outcome, "valid");
  if (touched.outcome === "valid") {
    assert.equal(touched.session.lastSeenAt, "2026-07-18T11:00:00.000Z");
    touched.session.lastSeenAt = "changed";
  }
  const inspected = await fixture.repository.inspectById(created.session.sessionId);
  assert.equal(inspected?.lastSeenAt, "2026-07-18T11:00:00.000Z");

  assert.deepEqual(await fixture.repository.touch("unknown-token"), {
    outcome: "unknown",
  });
  await fixture.repository.revoke(created.session.sessionId);
  assert.deepEqual(await fixture.repository.touch(created.sessionToken), {
    outcome: "revoked",
  });
});

test("revoking one session leaves another active", async () => {
  const { repository } = sessionFixture();
  const first = await repository.create("user_test");
  const second = await repository.create("user_test");

  const revoked = await repository.revoke(first.session.sessionId);
  assert.equal(revoked?.status, "revoked");
  assert.equal(
    (await repository.findValidByToken(first.sessionToken)).outcome,
    "revoked",
  );
  assert.equal(
    (await repository.findValidByToken(second.sessionToken)).outcome,
    "valid",
  );
});

test("revoke-all affects all active sessions for one user only", async () => {
  const { repository } = sessionFixture();
  const first = await repository.create("user_test");
  const second = await repository.create("user_test");
  const other = await repository.create("user_other");

  assert.equal(await repository.revokeAllForUser("user_test"), 2);
  assert.equal(
    (await repository.findValidByToken(first.sessionToken)).outcome,
    "revoked",
  );
  assert.equal(
    (await repository.findValidByToken(second.sessionToken)).outcome,
    "revoked",
  );
  assert.equal(
    (await repository.findValidByToken(other.sessionToken)).outcome,
    "valid",
  );
});

test("expired cleanup removes expired records but preserves active sessions", async () => {
  const fixture = sessionFixture({ lifetimeMs: 60_000 });
  const expired = await fixture.repository.create("user_test");
  fixture.setNow("2026-07-18T10:00:30.000Z");
  const active = await fixture.repository.create("user_test");
  fixture.setNow("2026-07-18T10:01:01.000Z");

  assert.equal(await fixture.repository.deleteExpired(), 1);
  assert.equal(
    await fixture.repository.inspectById(expired.session.sessionId),
    undefined,
  );
  assert.equal(
    (await fixture.repository.findValidByToken(expired.sessionToken)).outcome,
    "unknown",
  );
  assert.equal(
    (await fixture.repository.findValidByToken(active.sessionToken)).outcome,
    "valid",
  );
});

test("session outcomes and errors never contain token material", async () => {
  const { repository } = sessionFixture();
  const created = await repository.create("user_test");
  const unknown = await repository.findValidByToken("unknown-token");
  assert.equal(JSON.stringify(unknown).includes("unknown-token"), false);

  const inspected = await repository.inspectById(created.session.sessionId);
  assert.equal(JSON.stringify(inspected).includes(created.sessionToken), false);
  assert.equal(inspected && "tokenHash" in inspected, false);
});

test("expired sessions cannot be touched and creation summaries are defensive", async () => {
  const fixture = sessionFixture({ lifetimeMs: 60_000 });
  const created = await fixture.repository.create("user_test");
  created.session.lastSeenAt = "changed";
  const beforeExpiry = await fixture.repository.inspectById(
    created.session.sessionId,
  );
  assert.equal(beforeExpiry?.lastSeenAt, "2026-07-18T10:00:00.000Z");

  fixture.setNow("2026-07-18T10:01:00.000Z");
  assert.deepEqual(await fixture.repository.touch(created.sessionToken), {
    outcome: "expired",
  });
  const afterTouch = await fixture.repository.inspectById(
    created.session.sessionId,
  );
  assert.equal(afterTouch?.lastSeenAt, "2026-07-18T10:00:00.000Z");
});
