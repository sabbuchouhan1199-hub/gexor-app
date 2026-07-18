import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, test } from "node:test";

import type { ApiProblem, AuthenticationResponse, CurrentUserResponse } from "@gexor/contracts";
import { buildApp } from "./app.js";
import { InMemoryIdentityRepository } from "./auth/identity-repository.js";
import type { PasswordHashingService } from "./auth/identity-service.js";
import { InMemorySessionRepository } from "./auth/session-repository.js";
import type { SessionTokenGenerator } from "./auth/session-token.js";
import {
  InMemoryWorkspaceRepository,
  type WorkspaceAuthorization,
  type WorkspaceRepository,
} from "./auth/workspace-repository.js";
import type { TextProvider } from "./providers/provider.js";

const acceptedInput = "synthetic-accepted-input";

class ControlledHasher implements PasswordHashingService {
  async hash(input: string): Promise<string> {
    assert.equal(input, acceptedInput);
    return "controlled-encoded-credential";
  }

  async verify(input: string, encodedHash: string): Promise<boolean> {
    return input === acceptedInput && encodedHash === "controlled-encoded-credential";
  }
}

class DeterministicTokenGenerator implements SessionTokenGenerator {
  #sequence = 0;

  generate(): string {
    this.#sequence += 1;
    return Buffer.alloc(32, this.#sequence).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}

function fixture() {
  let now = new Date("2026-07-18T12:00:00.000Z");
  let identitySequence = 0;
  let workspaceSequence = 0;
  let sessionSequence = 0;
  let providerCalls = 0;
  const identityRepository = new InMemoryIdentityRepository({
    now: () => now,
    createId: () => `identity-${++identitySequence}`,
  });
  const workspaceRepository = new InMemoryWorkspaceRepository({
    now: () => now,
    createId: () => `workspace-part-${++workspaceSequence}`,
  });
  const sessionRepository = new InMemorySessionRepository({
    now: () => now,
    createId: () => `session-${++sessionSequence}`,
    tokenGenerator: new DeterministicTokenGenerator(),
  });
  const textProvider: TextProvider = {
    async generateText(request) {
      providerCalls += 1;
      return { provider: "controlled", model: "controlled-model", text: request.input };
    },
  };
  const app = buildApp({
    textProvider,
    identityRepository,
    workspaceRepository,
    sessionRepository,
    passwordHasher: new ControlledHasher(),
    syntheticPasswordHash: "controlled-synthetic-credential",
  });
  after(async () => app.close());
  return {
    app,
    identityRepository,
    setNow(value: string) { now = new Date(value); },
    providerCalls: () => providerCalls,
  };
}

let emailSequence = 0;
type AuthFixture = AuthenticationResponse & { testCookie: string; testCsrf: string };
async function register(target: ReturnType<typeof fixture>["app"]) {
  emailSequence += 1;
  const response = await target.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      displayName: "Example Person",
      email: `person-${emailSequence}@example.com`,
      password: acceptedInput,
    },
  });
  assert.equal(response.statusCode, 201);
  const header = response.headers["set-cookie"];
  const values = Array.isArray(header) ? header : [String(header)];
  const pairs = values.map((value) => value.split(";", 1)[0]!);
  const csrf = pairs.find((value) => value.startsWith("gexor_csrf="))?.slice("gexor_csrf=".length);
  assert.ok(csrf);
  return Object.assign(response.json() as AuthenticationResponse, {
    testCookie: pairs.join("; "), testCsrf: decodeURIComponent(csrf),
  }) as AuthFixture;
}

function headers(result: AuthFixture, workspaceId = result.workspace.workspaceId) {
  return {
    cookie: result.testCookie,
    "x-csrf-token": result.testCsrf,
    "x-workspace-id": workspaceId,
  };
}

function problem(response: { json(): unknown }): ApiProblem {
  return response.json() as ApiProblem;
}

test("registration provisions an active personal workspace and owner membership", async () => {
  const { app } = fixture();
  const registered = await register(app);
  assert.equal(registered.user.status, "active");
  assert.equal(registered.workspace.ownerUserId, registered.user.userId);
  assert.equal(registered.workspace.status, "active");
  assert.equal(registered.membership.role, "owner");
  assert.equal(registered.membership.status, "active");
  assert.equal(registered.membership.workspaceId, registered.workspace.workspaceId);
  assert.equal("passwordHash" in registered.user, false);
  assert.equal("tokenHash" in registered.session, false);

  const current = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: headers(registered),
  });
  assert.equal(current.statusCode, 200);
  const body = current.json() as CurrentUserResponse;
  assert.equal(body.user.userId, registered.user.userId);
  assert.equal(body.workspace.workspaceId, registered.workspace.workspaceId);
  assert.equal("sessionToken" in body, false);
});

test("registration validates input and rejects normalized duplicates safely", async () => {
  const { app } = fixture();
  const registered = await register(app);
  const duplicate = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      displayName: "Another Person",
      email: `  ${registered.user.email.toUpperCase()}  `,
      password: acceptedInput,
    },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(problem(duplicate).code, "EMAIL_ALREADY_EXISTS");
  assert.equal(duplicate.body.includes(registered.user.email), false);

  const invalid = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { displayName: "", email: "malformed", password: "short" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(problem(invalid).code, "VALIDATION_ERROR");
});

test("login succeeds and unknown-account and wrong-input failures are indistinguishable", async () => {
  const { app } = fixture();
  const registered = await register(app);
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: registered.user.email, password: acceptedInput },
  });
  assert.equal(login.statusCode, 200);
  assert.equal((login.json() as AuthenticationResponse).user.userId, registered.user.userId);

  const wrong = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: registered.user.email, password: "synthetic-rejected-input" },
  });
  const unknown = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "unknown@example.com", password: acceptedInput },
  });
  assert.equal(wrong.statusCode, 401);
  assert.equal(unknown.statusCode, 401);
  assert.equal(problem(wrong).code, "INVALID_CREDENTIALS");
  assert.equal(problem(unknown).code, "INVALID_CREDENTIALS");
  assert.equal(problem(wrong).detail, problem(unknown).detail);
});

test("logout is idempotent and revoked sessions cannot authorize requests", async () => {
  const { app } = fixture();
  const registered = await register(app);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: headers(registered),
    });
    assert.equal(logout.statusCode, 204);
  }
  const current = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: headers(registered),
  });
  assert.equal(current.statusCode, 401);
  assert.equal(problem(current).code, "SESSION_REVOKED");
});

test("expired and malformed sessions fail with controlled problems", async () => {
  const fixtureState = fixture();
  const registered = await register(fixtureState.app);
  fixtureState.setNow("2026-07-19T12:00:00.000Z");
  const expired = await fixtureState.app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: headers(registered),
  });
  assert.equal(expired.statusCode, 401);
  assert.equal(problem(expired).code, "SESSION_EXPIRED");

  for (const authorization of [undefined, "Basic invalid", "Bearer short"]) {
    const response = await fixtureState.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      ...(authorization ? { headers: { authorization } } : {}),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(problem(response).code, "AUTHENTICATION_REQUIRED");
  }
});

test("canonical runtime requires bearer and explicit workspace context", async () => {
  const { app } = fixture();
  const registered = await register(app);
  const missingBearer = await app.inject({
    method: "POST",
    url: "/api/v1/conversations/conv_test/messages",
    payload: { content: [{ type: "text", text: "hello" }] },
  });
  assert.equal(missingBearer.statusCode, 401);
  assert.equal(problem(missingBearer).code, "AUTHENTICATION_REQUIRED");

  const missingWorkspace = await app.inject({
    method: "POST",
    url: "/api/v1/conversations/conv_test/messages",
    headers: { cookie: registered.testCookie, "x-csrf-token": registered.testCsrf },
    payload: { content: [{ type: "text", text: "hello" }] },
  });
  assert.equal(missingWorkspace.statusCode, 400);
  assert.equal(problem(missingWorkspace).code, "WORKSPACE_CONTEXT_REQUIRED");
});

test("workspace membership prevents cross-workspace runtime access", async () => {
  const fixtureState = fixture();
  const first = await register(fixtureState.app);
  const second = await register(fixtureState.app);
  const callsBefore = fixtureState.providerCalls();
  const denied = await fixtureState.app.inject({
    method: "POST",
    url: "/api/v1/conversations/conv_test/messages",
    headers: headers(first, second.workspace.workspaceId),
    payload: { content: [{ type: "text", text: "hello" }] },
  });
  assert.equal(denied.statusCode, 404);
  assert.equal(problem(denied).code, "WORKSPACE_ACCESS_DENIED");
  assert.equal(fixtureState.providerCalls(), callsBefore);

  const accepted = await fixtureState.app.inject({
    method: "POST",
    url: "/api/v1/conversations/conv_test/messages",
    headers: headers(second),
    payload: { content: [{ type: "text", text: "hello" }] },
  });
  assert.equal(accepted.statusCode, 202);
  const executionUrl = (accepted.json() as { links: { execution: string } }).links.execution;
  const crossRead = await fixtureState.app.inject({
    method: "GET",
    url: executionUrl,
    headers: headers(first),
  });
  assert.equal(crossRead.statusCode, 404);
  assert.equal(problem(crossRead).code, "EXECUTION_NOT_FOUND");
});

test("workspace and authentication responses never expose internal credential fields", async () => {
  const { app } = fixture();
  const registered = await register(app);
  const serialized = JSON.stringify(registered);
  for (const field of ["passwordHash", "normalizedEmail", "tokenHash"]) {
    assert.equal(serialized.includes(field), false);
  }
});


test("personal workspace provisioning is idempotent and returns defensive snapshots", async () => {
  let sequence = 0;
  const repository = new InMemoryWorkspaceRepository({
    now: () => new Date("2026-07-18T12:00:00.000Z"),
    createId: () => `part-${++sequence}`,
  });
  const first = await repository.provisionPersonalWorkspace("user_test", "Example Person");
  const second = await repository.provisionPersonalWorkspace("user_test", "Changed Name");
  assert.deepEqual(second, first);
  first.workspace.name = "Mutated";
  first.membership.status = "revoked";
  const found = await repository.findPersonalWorkspaceForUser("user_test");
  assert.equal(found?.workspace.name, "Example Person Workspace");
  assert.equal(found?.membership.status, "active");
});

class FailingWorkspaceRepository implements WorkspaceRepository {
  async provisionPersonalWorkspace(): Promise<WorkspaceAuthorization> {
    throw new Error("Controlled provisioning failure.");
  }
  async findPersonalWorkspaceForUser(): Promise<WorkspaceAuthorization | undefined> {
    return undefined;
  }
  async authorize(): Promise<WorkspaceAuthorization | undefined> {
    return undefined;
  }
  async deletePersonalWorkspaceForUser(): Promise<void> {}
}

test("failed personal workspace provisioning rolls back the new identity", async () => {
  const identities = new InMemoryIdentityRepository({ createId: () => "rollback" });
  const rollbackApp = buildApp({
    textProvider: {
      async generateText(request) {
        return { provider: "controlled", model: "controlled", text: request.input };
      },
    },
    identityRepository: identities,
    sessionRepository: new InMemorySessionRepository({
      tokenGenerator: new DeterministicTokenGenerator(),
    }),
    workspaceRepository: new FailingWorkspaceRepository(),
    passwordHasher: new ControlledHasher(),
    syntheticPasswordHash: "controlled-synthetic-credential",
  });
  try {
    const response = await rollbackApp.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        displayName: "Rollback Person",
        email: "rollback@example.com",
        password: acceptedInput,
      },
    });
    assert.equal(response.statusCode, 500);
    assert.equal(
      await identities.findCredentialsByNormalizedEmail("rollback@example.com"),
      undefined,
    );
  } finally {
    await rollbackApp.close();
  }
});

test("disabled and unknown accounts share the same public login failure", async () => {
  const fixtureState = fixture();
  const registered = await register(fixtureState.app);
  await fixtureState.identityRepository.setStatus(registered.user.userId, "disabled");
  const disabled = await fixtureState.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: registered.user.email, password: acceptedInput },
  });
  const unknown = await fixtureState.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "absent@example.com", password: acceptedInput },
  });
  assert.equal(disabled.statusCode, 401);
  assert.equal(unknown.statusCode, 401);
  assert.equal(problem(disabled).code, "INVALID_CREDENTIALS");
  assert.equal(problem(disabled).detail, problem(unknown).detail);
});
