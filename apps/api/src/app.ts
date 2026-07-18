import { randomUUID } from "node:crypto";

import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type {
  ApiProblem,
  ApiProblemCode,
  AuthenticationResponse,
  ChatRequest,
  ChatResponse,
  CurrentUserResponse,
  LoginRequest,
  MessageSubmissionRequest,
  MessageSubmissionResponse,
  RegisterRequest,
  RuntimeExecutionResponse,
} from "@gexor/contracts";
import { AuthDomainError } from "./auth/auth-errors.js";
import { AuthenticationService } from "./auth/authentication-service.js";
import {
  InMemoryIdentityRepository,
  type IdentityRepository,
} from "./auth/identity-repository.js";
import {
  IdentityService,
  type PasswordHashingService,
} from "./auth/identity-service.js";
import { PasswordHasher } from "./auth/password-hasher.js";
import {
  InMemorySessionRepository,
  type SessionRepository,
} from "./auth/session-repository.js";
import {
  InMemoryWorkspaceRepository,
  type WorkspaceAuthorization,
  type WorkspaceRepository,
} from "./auth/workspace-repository.js";
import { problemDefinitions } from "./problem-details.js";
import type { TextProvider } from "./providers/provider.js";
import { ProviderError } from "./providers/errors.js";
import { RuntimeExecutor } from "./runtime-executor.js";
import { InMemoryRuntimeExecutionStore } from "./runtime-execution-store.js";

export type AppDependencies = {
  textProvider: TextProvider;
  executionStore?: InMemoryRuntimeExecutionStore;
  identityRepository?: IdentityRepository;
  sessionRepository?: SessionRepository;
  workspaceRepository?: WorkspaceRepository;
  passwordHasher?: PasswordHashingService;
  syntheticPasswordHash?: string;
};

type AuthorizationContext = WorkspaceAuthorization & {
  userId: string;
  session: CurrentUserResponse["session"];
  sessionToken: string;
};

declare module "fastify" {
  interface FastifyInstance {
    textProvider: TextProvider;
    executionStore: InMemoryRuntimeExecutionStore;
    runtimeExecutor: RuntimeExecutor;
    identityRepository: IdentityRepository;
    sessionRepository: SessionRepository;
    workspaceRepository: WorkspaceRepository;
    authenticationService: AuthenticationService;
  }
  interface FastifyRequest {
    authorizationContext?: AuthorizationContext;
  }
}

const problemContentType = "application/problem+json";
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const bearerPattern = /^Bearer ([A-Za-z0-9_-]{20,512})$/;
const workspaceIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const syntheticPasswordHash = [
  "scrypt",
  "v1",
  "N=16384,r=8,p=1,l=64",
  Buffer.alloc(16).toString("base64url"),
  Buffer.alloc(64).toString("base64url"),
].join("$");

const chatRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 4000, pattern: "\\S" },
  },
} as const;

const registerRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["displayName", "email", "password"],
  properties: {
    displayName: { type: "string", minLength: 1, maxLength: 100 },
    email: { type: "string", minLength: 3, maxLength: 254 },
    password: { type: "string", minLength: 1, maxLength: 256 },
  },
} as const;

const loginRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: { type: "string", minLength: 1, maxLength: 254 },
    password: { type: "string", minLength: 1, maxLength: 256 },
  },
} as const;

const messageSubmissionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["content"],
  properties: {
    content: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text"],
        properties: {
          type: { type: "string", const: "text" },
          text: { type: "string", minLength: 1, maxLength: 4000, pattern: "\\S" },
        },
      },
    },
  },
} as const;

const routeParamsSchema = (property: string) => ({
  type: "object",
  additionalProperties: false,
  required: [property],
  properties: {
    [property]: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" },
  },
}) as const;

function createProblem(
  code: ApiProblemCode,
  status: number,
  requestId: string,
  overrides: Partial<Pick<ApiProblem, "detail" | "retryable" | "errors">> = {},
): ApiProblem {
  return {
    ...problemDefinitions[code],
    status,
    code,
    requestId,
    ...overrides,
  };
}

function sendProblem(
  reply: FastifyReply,
  requestId: string,
  code: ApiProblemCode,
  status: number,
): FastifyReply {
  return reply.status(status).type(problemContentType).send(
    createProblem(code, status, requestId),
  );
}

function safeValidationErrors(error: FastifyError): ApiProblem["errors"] {
  return error.validation?.map((issue) => ({
    path: issue.instancePath || "/",
    message: issue.keyword === "additionalProperties"
      ? "Unknown fields are not allowed."
      : issue.message ?? "Invalid value.",
  }));
}

function bearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return undefined;
  return bearerPattern.exec(authorization)?.[1];
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
    genReqId(rawRequest) {
      const candidate = rawRequest.headers["x-request-id"];
      if (typeof candidate === "string" && requestIdPattern.test(candidate)) return candidate;
      return `req_${randomUUID()}`;
    },
  });

  const executionStore = dependencies.executionStore ?? new InMemoryRuntimeExecutionStore();
  const identities = dependencies.identityRepository ?? new InMemoryIdentityRepository();
  const sessions = dependencies.sessionRepository ?? new InMemorySessionRepository();
  const workspaces = dependencies.workspaceRepository ?? new InMemoryWorkspaceRepository();
  const identityService = new IdentityService({
    repository: identities,
    passwordHasher: dependencies.passwordHasher ?? new PasswordHasher(),
    syntheticPasswordHash: dependencies.syntheticPasswordHash ?? syntheticPasswordHash,
  });
  const authenticationService = new AuthenticationService({
    identities,
    identityService,
    sessions,
    workspaces,
  });

  app.decorate("textProvider", dependencies.textProvider);
  app.decorate("executionStore", executionStore);
  app.decorate("runtimeExecutor", new RuntimeExecutor(executionStore, dependencies.textProvider));
  app.decorate("identityRepository", identities);
  app.decorate("sessionRepository", sessions);
  app.decorate("workspaceRepository", workspaces);
  app.decorate("authenticationService", authenticationService);

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  async function authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    requireWorkspace: boolean,
  ): Promise<AuthorizationContext | undefined> {
    const sessionToken = bearerToken(request);
    if (!sessionToken) {
      sendProblem(reply, request.id, "AUTHENTICATION_REQUIRED", 401);
      return undefined;
    }

    const lookup = await sessions.touch(sessionToken);
    if (lookup.outcome === "expired") {
      sendProblem(reply, request.id, "SESSION_EXPIRED", 401);
      return undefined;
    }
    if (lookup.outcome === "revoked") {
      sendProblem(reply, request.id, "SESSION_REVOKED", 401);
      return undefined;
    }
    if (lookup.outcome === "unknown") {
      sendProblem(reply, request.id, "AUTHENTICATION_REQUIRED", 401);
      return undefined;
    }

    const user = await identities.findById(lookup.session.userId);
    if (!user || user.status !== "active") {
      sendProblem(reply, request.id, "USER_DISABLED", 403);
      return undefined;
    }

    const header = request.headers["x-workspace-id"];
    const requestedWorkspaceId = typeof header === "string" ? header : undefined;
    if (requireWorkspace && (!requestedWorkspaceId || !workspaceIdPattern.test(requestedWorkspaceId))) {
      sendProblem(reply, request.id, "WORKSPACE_CONTEXT_REQUIRED", 400);
      return undefined;
    }

    const authorization = requestedWorkspaceId
      ? await workspaces.authorize(user.userId, requestedWorkspaceId)
      : await workspaces.findPersonalWorkspaceForUser(user.userId);
    if (!authorization) {
      sendProblem(reply, request.id, "WORKSPACE_ACCESS_DENIED", 404);
      return undefined;
    }

    return {
      userId: user.userId,
      session: lookup.session,
      sessionToken,
      ...authorization,
    };
  }

  const requireSession = async (request: FastifyRequest, reply: FastifyReply) => {
    request.authorizationContext = await authorize(request, reply, false);
  };
  const requireWorkspace = async (request: FastifyRequest, reply: FastifyReply) => {
    request.authorizationContext = await authorize(request, reply, true);
  };

  const healthHandler = async () => ({ status: "ok" as const });
  app.get("/health", healthHandler);
  app.get("/api/v1/health", healthHandler);

  app.post<{ Body: RegisterRequest; Reply: AuthenticationResponse | ApiProblem }>(
    "/api/v1/auth/register",
    { schema: { body: registerRequestSchema } },
    async (request, reply) => reply.status(201).send(
      await authenticationService.register(request.body),
    ),
  );

  app.post<{ Body: LoginRequest; Reply: AuthenticationResponse | ApiProblem }>(
    "/api/v1/auth/login",
    { schema: { body: loginRequestSchema } },
    async (request) => authenticationService.login(request.body),
  );

  app.post<{ Reply: ApiProblem | undefined }>(
    "/api/v1/auth/logout",
    async (request, reply) => {
      const token = bearerToken(request);
      if (!token) return sendProblem(reply, request.id, "AUTHENTICATION_REQUIRED", 401);
      const result = await sessions.revokeByToken(token);
      if (result.outcome === "unknown") {
        return sendProblem(reply, request.id, "AUTHENTICATION_REQUIRED", 401);
      }
      if (result.outcome === "expired") {
        return sendProblem(reply, request.id, "SESSION_EXPIRED", 401);
      }
      return reply.status(204).send(undefined);
    },
  );

  app.get<{ Reply: CurrentUserResponse | ApiProblem }>(
    "/api/v1/auth/me",
    { preHandler: requireSession },
    async (request, reply) => {
      const context = request.authorizationContext;
      if (!context) return reply;
      const current = await authenticationService.currentUser(
        context.userId,
        context.session,
        context.workspace.workspaceId,
      );
      if (!current) return sendProblem(reply, request.id, "AUTHENTICATION_REQUIRED", 401);
      return current;
    },
  );

  app.post<{ Body: ChatRequest; Reply: ChatResponse | ApiProblem }>(
    "/mock/chat",
    { schema: { body: chatRequestSchema } },
    async (request) => ({ reply: `Mock reply: ${request.body.message.trim()}` }),
  );

  app.post<{ Body: ChatRequest; Reply: ChatResponse | ApiProblem }>(
    "/chat",
    { schema: { body: chatRequestSchema } },
    async (request) => {
      const accepted = app.runtimeExecutor.accept({
        conversationId: "conv_compatibility",
        requestId: request.id,
      });
      const completed = await app.runtimeExecutor.execute(
        accepted.executionId,
        request.body.message.trim(),
      );
      return { reply: completed.response!.text };
    },
  );

  app.post<{
    Params: { conversationId: string };
    Body: MessageSubmissionRequest;
    Reply: MessageSubmissionResponse | ApiProblem;
  }>(
    "/api/v1/conversations/:conversationId/messages",
    {
      schema: {
        params: routeParamsSchema("conversationId"),
        body: messageSubmissionSchema,
      },
      preHandler: requireWorkspace,
    },
    async (request, reply) => {
      const context = request.authorizationContext;
      if (!context) return reply;
      const accepted = app.runtimeExecutor.accept({
        conversationId: request.params.conversationId,
        requestId: request.id,
        workspaceId: context.workspace.workspaceId,
        requestedBy: context.userId,
      });
      const input = request.body.content[0].text.trim();

      setImmediate(() => {
        void app.runtimeExecutor.execute(accepted.executionId, input).catch(() => undefined);
      });

      return reply.status(202).send({
        messageId: accepted.messageId,
        executionId: accepted.executionId,
        state: accepted.state,
        requestId: accepted.requestId,
        createdAt: accepted.createdAt,
        links: { execution: accepted.links.self },
      });
    },
  );

  app.get<{
    Params: { executionId: string };
    Reply: RuntimeExecutionResponse | ApiProblem;
  }>(
    "/api/v1/executions/:executionId",
    {
      schema: { params: routeParamsSchema("executionId") },
      preHandler: requireWorkspace,
    },
    async (request, reply) => {
      const context = request.authorizationContext;
      if (!context) return reply;
      const execution = app.executionStore.get(request.params.executionId);
      if (
        execution
        && execution.workspaceId === context.workspace.workspaceId
      ) {
        return execution;
      }
      return sendProblem(reply, request.id, "EXECUTION_NOT_FOUND", 404);
    },
  );

  app.setNotFoundHandler(async (request, reply) => sendProblem(
    reply,
    request.id,
    "ROUTE_NOT_FOUND",
    404,
  ));

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.status(400).type(problemContentType).send(
        createProblem("VALIDATION_ERROR", 400, request.id, {
          errors: safeValidationErrors(error),
        }),
      );
    }

    if (error instanceof AuthDomainError) {
      const mapping: Partial<Record<AuthDomainError["code"], [ApiProblemCode, number]>> = {
        INVALID_EMAIL: ["VALIDATION_ERROR", 400],
        INVALID_DISPLAY_NAME: ["VALIDATION_ERROR", 400],
        PASSWORD_POLICY_VIOLATION: ["PASSWORD_POLICY_VIOLATION", 400],
        DUPLICATE_EMAIL: ["EMAIL_ALREADY_EXISTS", 409],
        INVALID_CREDENTIALS: ["INVALID_CREDENTIALS", 401],
        USER_DISABLED: ["INVALID_CREDENTIALS", 401],
      };
      const [code, status] = mapping[error.code] ?? ["INTERNAL_SERVER_ERROR", 500];
      return sendProblem(reply, request.id, code, status);
    }

    if (error instanceof ProviderError) {
      return reply.status(error.status).type(problemContentType).send(
        createProblem(error.code, error.status, request.id, {
          retryable: error.retryable,
        }),
      );
    }

    app.log.error(error);
    return sendProblem(reply, request.id, "INTERNAL_SERVER_ERROR", 500);
  });

  return app;
}
