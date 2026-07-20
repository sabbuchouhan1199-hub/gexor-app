import { createHash, randomUUID } from "node:crypto";

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
  ConversationSummary,
  ConversationListResponse,
  ConversationMessagesResponse,
  CreateConversationRequest,
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
import {
  InMemoryRuntimeExecutionStore,
  type RuntimeExecutionStore,
} from "./runtime-execution-store.js";
import type { ConversationRepository } from "./persistence/sqlite-repositories.js";
import type { MessageAcceptanceRepository } from "./persistence/sqlite-runtime-repository.js";
import type { SqliteProductionRuntimeRepository } from "./persistence/production-runtime-repository.js";
import { AttachmentValidationError, parseSingleMultipartFile, type SqliteAttachmentRepository } from "./persistence/attachment-repository.js";
import type { SqliteProviderConnectionRepository, WorkspaceProviderConnectionService } from "./persistence/sqlite-provider-connections.js";

export type AppDependencies = {
  textProvider: TextProvider;
  executionStore?: RuntimeExecutionStore;
  compatibilityExecutionStore?: RuntimeExecutionStore;
  conversationRepository?: ConversationRepository;
  messageAcceptanceRepository?: MessageAcceptanceRepository;
  productionRuntime?: SqliteProductionRuntimeRepository;
  attachmentRepository?: SqliteAttachmentRepository;
  providerConnectionRepository?: SqliteProviderConnectionRepository;
  providerConnectionService?: WorkspaceProviderConnectionService;
  workspaceProviderResolver?: (workspaceId: string) => Promise<TextProvider>;
  identityRepository?: IdentityRepository;
  sessionRepository?: SessionRepository;
  workspaceRepository?: WorkspaceRepository;
  passwordHasher?: PasswordHashingService;
  syntheticPasswordHash?: string;
  atomicRegistration?: import("./auth/authentication-service.js").AtomicRegistrationService;
  authCookies?: { secure: boolean; allowedOrigin?: string };
  structuredLogging?: boolean;
  readiness?: () => boolean;
};

type AuthorizationContext = WorkspaceAuthorization & {
  userId: string;
  session: CurrentUserResponse["session"];
  sessionToken: string;
};

declare module "fastify" {
  interface FastifyInstance {
    textProvider: TextProvider;
    executionStore: RuntimeExecutionStore;
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
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{1,128}$/;
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

const createConversationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
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

const productionSessionCookie = "__Host-gexor_session";
const developmentSessionCookie = "gexor_session";
const csrfCookie = "gexor_csrf";

function cookies(request: FastifyRequest): Record<string, string> {
  const header = request.headers.cookie; const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const index = part.indexOf("="); if (index < 1) continue;
    const name = part.slice(0, index).trim(); const value = part.slice(index + 1).trim();
    try { result[name] = decodeURIComponent(value); } catch { /* Ignore malformed cookie input. */ }
  }
  return result;
}

function csrfForSession(token: string): string {
  return createHash("sha256").update(`gexor-csrf-v1:${token}`, "utf8").digest("base64url");
}

function publicAuthentication(result: import("./auth/authentication-service.js").AuthenticationResult): AuthenticationResponse {
  const { sessionToken: _sessionToken, ...publicResult } = result;
  return publicResult;
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function setAuthenticationCookies(
  reply: FastifyReply, result: import("./auth/authentication-service.js").AuthenticationResult,
  options: NonNullable<AppDependencies["authCookies"]>,
): void {
  const sessionName = options.secure ? productionSessionCookie : developmentSessionCookie;
  const maxAge = Math.max(0, Math.floor((Date.parse(result.session.expiresAt) - Date.now()) / 1000));
  const secure = options.secure ? "; Secure" : "";
  reply.header("Set-Cookie", [
    `${sessionName}=${encodeURIComponent(result.sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
    `${csrfCookie}=${csrfForSession(result.sessionToken)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  ]);
}

function clearAuthenticationCookies(reply: FastifyReply, secure: boolean): void {
  const suffix = `; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
  reply.header("Set-Cookie", [
    `${secure ? productionSessionCookie : developmentSessionCookie}=${suffix}; HttpOnly`,
    `${csrfCookie}=${suffix}`,
  ]);
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: dependencies.structuredLogging ? { level: "info", redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-csrf-token", "req.body.password", "req.body.credentialReference"] } : false,
    ajv: { customOptions: { removeAdditional: false } },
    genReqId(rawRequest) {
      const candidate = rawRequest.headers["x-request-id"];
      if (typeof candidate === "string" && requestIdPattern.test(candidate)) return candidate;
      return `req_${randomUUID()}`;
    },
  });

  const metrics = { requests: 0, errors: 0, activeSse: 0, streamReconnects: 0, replayGaps: 0, rateLimitRejections: 0 };
  const rateWindows = new Map<string, { count: number; resetAt: number }>();

  app.addContentTypeParser(/^multipart\/form-data(?:;|$)/i, { parseAs: "buffer", bodyLimit: 5 * 1024 * 1024 + 64 * 1024 }, (_request, body, done) => {
    done(null, Buffer.isBuffer(body) ? body : Buffer.from(body));
  });

  const executionStore = dependencies.executionStore ?? new InMemoryRuntimeExecutionStore();
  const compatibilityExecutionStore = dependencies.compatibilityExecutionStore ?? executionStore;
  const compatibilityRuntimeExecutor = new RuntimeExecutor(
    compatibilityExecutionStore,
    dependencies.textProvider,
  );
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
    ...(dependencies.atomicRegistration ? { atomicRegistration: dependencies.atomicRegistration } : {}),
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

  app.addHook("onResponse", async (_request, reply) => { metrics.requests++; if (reply.statusCode >= 400) metrics.errors++; });

  app.addHook("onRequest", async (request, reply) => {
    const path=request.url.split("?",1)[0]!;const method=request.method;let limit=120;
    if(path.includes("/auth/login")||path.includes("/auth/register"))limit=10;
    else if(path.endsWith("/files")&&method==="POST")limit=12;
    else if(path.endsWith("/events"))limit=12;
    else if(/\/(cancel|retry|regenerate)$/.test(path))limit=30;
    else if(path.includes("/search")||path.endsWith("/usage"))limit=60;
    const values=cookies(request);const credential=bearerToken(request)??values[dependencies.authCookies?.secure?productionSessionCookie:developmentSessionCookie];
    const principal=credential?createHash("sha256").update(credential).digest("hex").slice(0,24):request.ip;
    const key=`${principal}:${method}:${path.replace(/[A-Za-z0-9_-]{20,}/g,":id")}`;const now=Date.now();let window=rateWindows.get(key);
    if(!window||window.resetAt<=now){window={count:0,resetAt:now+60_000};rateWindows.set(key,window)}window.count++;
    if(window.count>limit){metrics.rateLimitRejections++;const retry=Math.max(1,Math.ceil((window.resetAt-now)/1000));reply.header("Retry-After",String(retry));return sendProblem(reply,request.id,"RATE_LIMITED",429)}
    if(rateWindows.size>10_000)for(const [entryKey,value]of rateWindows)if(value.resetAt<=now)rateWindows.delete(entryKey);
  });

  app.addHook("onRequest", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || bearerToken(request)) return;
    if (request.url.startsWith("/api/v1/auth/login") || request.url.startsWith("/api/v1/auth/register")) return;
    const values = cookies(request);
    const token = values[dependencies.authCookies?.secure ? productionSessionCookie : developmentSessionCookie];
    if (!token) return;
    const origin = request.headers.origin;
    if (origin && dependencies.authCookies?.allowedOrigin && origin !== dependencies.authCookies.allowedOrigin) {
      return sendProblem(reply, request.id, "ORIGIN_NOT_ALLOWED", 403);
    }
    const header = request.headers["x-csrf-token"];
    const proof = values[csrfCookie];
    if (typeof header !== "string" || !proof || header !== proof || proof !== csrfForSession(token)) {
      return sendProblem(reply, request.id, "CSRF_VALIDATION_FAILED", 403);
    }
  });

  async function authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    requireWorkspace: boolean,
  ): Promise<AuthorizationContext | undefined> {
    const cookieValues = cookies(request);
    const sessionToken = bearerToken(request)
      ?? cookieValues[dependencies.authCookies?.secure ? productionSessionCookie : developmentSessionCookie];
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
  app.get("/api/v1/health/live", healthHandler);
  app.get("/api/v1/health/ready", async (_request, reply) => dependencies.readiness?.() === false ? reply.status(503).send({status:"not_ready"}) : {status:"ready"});
  app.get("/api/v1/metrics", {preHandler:requireSession}, async (_request,reply)=>{
    const queue = dependencies.productionRuntime?.queueStats();
    return reply.type("text/plain; version=0.0.4").send([
      `gexor_http_requests_total ${metrics.requests}`,`gexor_http_errors_total ${metrics.errors}`,
      `gexor_sse_connections_active ${metrics.activeSse}`,`gexor_sse_reconnects_total ${metrics.streamReconnects}`,
      `gexor_replay_gaps_total ${metrics.replayGaps}`,`gexor_rate_limit_rejections_total ${metrics.rateLimitRejections}`,
      `gexor_queue_queued ${queue?.queued ?? 0}`,`gexor_queue_retry_wait ${queue?.retryWait ?? 0}`,
      `gexor_queue_leased ${queue?.leased ?? 0}`,`gexor_queue_dead_letter ${queue?.deadLetter ?? 0}`,
      `gexor_queue_oldest_queued_age_ms ${queue?.oldestQueuedAgeMs ?? 0}`,
    ].join("\n")+"\n");
  });

  app.post<{ Body: RegisterRequest; Reply: AuthenticationResponse | ApiProblem }>(
    "/api/v1/auth/register",
    { schema: { body: registerRequestSchema } },
    async (request, reply) => {
      const result = await authenticationService.register(request.body);
      setAuthenticationCookies(reply, result, dependencies.authCookies ?? { secure: false });
      return reply.status(201).send(publicAuthentication(result));
    },
  );

  app.post<{ Body: LoginRequest; Reply: AuthenticationResponse | ApiProblem }>(
    "/api/v1/auth/login",
    { schema: { body: loginRequestSchema } },
    async (request, reply) => {
      const result = await authenticationService.login(request.body);
      setAuthenticationCookies(reply, result, dependencies.authCookies ?? { secure: false });
      return publicAuthentication(result);
    },
  );

  app.post<{ Reply: ApiProblem | undefined }>(
    "/api/v1/auth/logout",
    async (request, reply) => {
      const token = bearerToken(request) ?? cookies(request)[dependencies.authCookies?.secure ? productionSessionCookie : developmentSessionCookie];
      if (!token) return sendProblem(reply, request.id, "AUTHENTICATION_REQUIRED", 401);
      const result = await sessions.revokeByToken(token);
      if (result.outcome === "unknown") {
        return sendProblem(reply, request.id, "AUTHENTICATION_REQUIRED", 401);
      }
      if (result.outcome === "expired") {
        return sendProblem(reply, request.id, "SESSION_EXPIRED", 401);
      }
      clearAuthenticationCookies(reply, dependencies.authCookies?.secure ?? false);
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
      const accepted = compatibilityRuntimeExecutor.accept({
        conversationId: "conv_compatibility",
        requestId: request.id,
      });
      const completed = await compatibilityRuntimeExecutor.execute(
        accepted.executionId,
        request.body.message.trim(),
      );
      return { reply: completed.response!.text };
    },
  );

  app.get("/api/v1/providers", { preHandler: requireSession }, async () => ({
    providers: dependencies.providerConnectionRepository?.listProviders() ?? [],
    models: dependencies.providerConnectionRepository?.listModels() ?? [],
  }));

  app.get<{ Params: { workspaceId: string } }>(
    "/api/v1/workspaces/:workspaceId/provider-connections",
    { schema: { params: routeParamsSchema("workspaceId") }, preHandler: requireWorkspace },
    async (request, reply) => {
      const context = request.authorizationContext;
      if (!context || request.params.workspaceId !== context.workspace.workspaceId) return sendProblem(reply, request.id, "WORKSPACE_ACCESS_DENIED", 404);
      return { connections: dependencies.providerConnectionRepository?.list(context.workspace.workspaceId) ?? [], routing: dependencies.providerConnectionRepository?.routing(context.workspace.workspaceId) ?? [], selected: dependencies.providerConnectionRepository?.selectedSummary(context.workspace.workspaceId) };
    },
  );

  app.post<{ Params: { workspaceId: string }; Body: { providerKey: string; credentialReference: string } }>(
    "/api/v1/workspaces/:workspaceId/provider-connections",
    { schema: { params: routeParamsSchema("workspaceId"), body: { type: "object", additionalProperties: false, required: ["providerKey", "credentialReference"], properties: { providerKey: { type: "string", minLength: 1, maxLength: 64 }, credentialReference: { type: "string", minLength: 3, maxLength: 256 } } } }, preHandler: requireWorkspace },
    async (request, reply) => {
      const context=request.authorizationContext; if(!context || request.params.workspaceId!==context.workspace.workspaceId) return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404);
      if(!dependencies.providerConnectionRepository) return sendProblem(reply,request.id,"INTERNAL_SERVER_ERROR",500);
      return reply.status(201).send(dependencies.providerConnectionRepository.create(context.workspace.workspaceId,context.userId,request.body.providerKey,request.body.credentialReference));
    },
  );

  app.patch<{ Params: { workspaceId: string; connectionId: string }; Body: { priority?: number; enabled?: boolean; isDefault?: boolean; modelKey?: string } }>(
    "/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/routing",
    { schema: { params: { type:"object",additionalProperties:false,required:["workspaceId","connectionId"],properties:{workspaceId:{type:"string"},connectionId:{type:"string"}} }, body: { type:"object",additionalProperties:false,minProperties:1,properties:{priority:{type:"integer",minimum:0,maximum:10000},enabled:{type:"boolean"},isDefault:{type:"boolean"},modelKey:{type:"string",minLength:1,maxLength:128}} } }, preHandler: requireWorkspace },
    async(request,reply)=>{ const c=request.authorizationContext; if(!c||request.params.workspaceId!==c.workspace.workspaceId) return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404);
      const result=dependencies.providerConnectionRepository?.configureRouting(c.workspace.workspaceId,request.params.connectionId,request.body,c.userId);
      return result??sendProblem(reply,request.id,"PROVIDER_CONNECTION_INVALID",404); },
  );

  app.post<{ Params: { workspaceId: string; connectionId: string } }>(
    "/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/test",
    { preHandler: requireWorkspace }, async(request,reply)=>{ const c=request.authorizationContext; if(!c||request.params.workspaceId!==c.workspace.workspaceId) return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404); const result=await dependencies.providerConnectionService?.validate(c.workspace.workspaceId,request.params.connectionId,c.userId); return result ?? sendProblem(reply,request.id,"PROVIDER_CONNECTION_INVALID",404); },
  );

  app.post<{ Params: { workspaceId: string; connectionId: string }; Body: { modelKey: string } }>(
    "/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/select",
    { schema: { body: { type:"object",additionalProperties:false,required:["modelKey"],properties:{modelKey:{type:"string",minLength:1,maxLength:128}} } }, preHandler: requireWorkspace }, async(request,reply)=>{ const c=request.authorizationContext; if(!c||request.params.workspaceId!==c.workspace.workspaceId) return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404); const selected=dependencies.providerConnectionRepository?.select(c.workspace.workspaceId,request.params.connectionId,request.body.modelKey,c.userId); return selected ? { selected: true } : sendProblem(reply,request.id,"PROVIDER_CONNECTION_INVALID",409); },
  );

  app.post<{ Params: { workspaceId: string; connectionId: string } }>(
    "/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/revoke",
    { preHandler: requireWorkspace }, async(request,reply)=>{ const c=request.authorizationContext; if(!c||request.params.workspaceId!==c.workspace.workspaceId) return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404); const result=dependencies.providerConnectionRepository?.revoke(c.workspace.workspaceId,request.params.connectionId,c.userId); return result ?? sendProblem(reply,request.id,"PROVIDER_CONNECTION_INVALID",404); },
  );

  app.post<{ Params: { workspaceId: string; connectionId: string }; Body: { credentialReference: string } }>(
    "/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/rotate",
    { schema: { body: { type:"object",additionalProperties:false,required:["credentialReference"],properties:{credentialReference:{type:"string",minLength:3,maxLength:256}} } }, preHandler: requireWorkspace }, async(request,reply)=>{ const c=request.authorizationContext; if(!c||request.params.workspaceId!==c.workspace.workspaceId) return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404); const result=dependencies.providerConnectionRepository?.rotateReference(c.workspace.workspaceId,request.params.connectionId,c.userId,request.body.credentialReference); return result ?? sendProblem(reply,request.id,"PROVIDER_CONNECTION_INVALID",404); },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: CreateConversationRequest;
    Reply: ConversationSummary | ApiProblem;
  }>(
    "/api/v1/workspaces/:workspaceId/conversations",
    {
      schema: {
        params: routeParamsSchema("workspaceId"),
        body: createConversationSchema,
      },
      preHandler: requireWorkspace,
    },
    async (request, reply) => {
      const context = request.authorizationContext;
      if (!context) return reply;
      if (request.params.workspaceId !== context.workspace.workspaceId) {
        return sendProblem(reply, request.id, "WORKSPACE_ACCESS_DENIED", 404);
      }
      if (!dependencies.conversationRepository) {
        return sendProblem(reply, request.id, "INTERNAL_SERVER_ERROR", 500);
      }
      const conversation = await dependencies.conversationRepository.create(
        context.workspace.workspaceId,
        context.userId,
        request.body.title,
      );
      return reply.status(201).send(conversation);
    },
  );

  app.get<{ Params: { workspaceId: string }; Reply: ConversationListResponse | ApiProblem }>("/api/v1/workspaces/:workspaceId/conversations", { schema: { params: routeParamsSchema("workspaceId") }, preHandler: requireWorkspace }, async (request, reply) => { const c=request.authorizationContext; if(!c||request.params.workspaceId!==c.workspace.workspaceId) return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404); if(!dependencies.conversationRepository) return sendProblem(reply,request.id,"INTERNAL_SERVER_ERROR",500); return {conversations:await dependencies.conversationRepository.list(c.workspace.workspaceId)}; });

  app.get<{ Params: { workspaceId: string }; Querystring: { q?: string; cursor?: string; limit?: string } }>(
    "/api/v1/workspaces/:workspaceId/conversations/search",
    { schema: { params: routeParamsSchema("workspaceId") }, preHandler: requireWorkspace },
    async(request,reply)=>{const c=request.authorizationContext;if(!c||request.params.workspaceId!==c.workspace.workspaceId)return sendProblem(reply,request.id,"WORKSPACE_ACCESS_DENIED",404);
      const q=(request.query.q??"").trim();if(!q||q.length>200)return sendProblem(reply,request.id,"VALIDATION_ERROR",400);
      const offset=/^\d+$/.test(request.query.cursor??"")?Number(request.query.cursor):0;const limit=/^\d+$/.test(request.query.limit??"")?Number(request.query.limit):20;
      const results=await dependencies.conversationRepository?.search(c.workspace.workspaceId,q,offset,limit)??[];
      return {results,...(results.length>=Math.min(50,Math.max(1,limit))?{nextCursor:String(offset+results.length)}:{})};},
  );

  app.patch<{ Params: { conversationId: string }; Body: { title: string } }>(
    "/api/v1/conversations/:conversationId",
    { schema:{params:routeParamsSchema("conversationId"),body:createConversationSchema},preHandler:requireWorkspace },
    async(request,reply)=>{const c=request.authorizationContext;if(!c)return reply;const result=await dependencies.conversationRepository?.rename(c.workspace.workspaceId,request.params.conversationId,request.body.title);return result??sendProblem(reply,request.id,"CONVERSATION_NOT_FOUND",404);},
  );

  app.delete<{ Params: { conversationId: string } }>(
    "/api/v1/conversations/:conversationId",
    { schema:{params:routeParamsSchema("conversationId")},preHandler:requireWorkspace },
    async(request,reply)=>{const c=request.authorizationContext;if(!c)return reply;const deleted=await dependencies.conversationRepository?.softDelete(c.workspace.workspaceId,request.params.conversationId,c.userId);return deleted?reply.status(204).send():sendProblem(reply,request.id,"CONVERSATION_NOT_FOUND",404);},
  );

  app.get<{ Params: { conversationId: string }; Reply: ConversationMessagesResponse | ApiProblem }>("/api/v1/conversations/:conversationId/messages", { schema: { params: routeParamsSchema("conversationId") }, preHandler: requireWorkspace }, async (request, reply) => { const c=request.authorizationContext; if(!c) return reply; const messages=await dependencies.conversationRepository?.messages(c.workspace.workspaceId,request.params.conversationId); return messages?{messages}:sendProblem(reply,request.id,"CONVERSATION_NOT_FOUND",404); });

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
      const input = request.body.content[0].text.trim();
      let accepted: RuntimeExecutionResponse;
      let shouldExecute = true;

      if (dependencies.workspaceProviderResolver && !dependencies.providerConnectionRepository?.selected(context.workspace.workspaceId)) {
        return sendProblem(reply, request.id, "PROVIDER_CONNECTION_REQUIRED", 409);
      }
      const budget = dependencies.productionRuntime?.checkBudget(context.workspace.workspaceId, estimateTextTokens(input));
      if (budget && !budget.allowed) return sendProblem(reply, request.id, "BUDGET_EXCEEDED", 429);

      if (dependencies.messageAcceptanceRepository) {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || !idempotencyKeyPattern.test(key)) {
          return sendProblem(reply, request.id, "IDEMPOTENCY_KEY_REQUIRED", 400);
        }
        const requestHash = createHash("sha256")
          .update(JSON.stringify(request.body), "utf8")
          .digest("hex");
        const result = await dependencies.messageAcceptanceRepository.accept({
          actorUserId: context.userId,
          workspaceId: context.workspace.workspaceId,
          conversationId: request.params.conversationId,
          requestId: request.id,
          idempotencyKey: key,
          requestHash,
          text: input,
        });
        if (result.outcome === "conflict") {
          return sendProblem(reply, request.id, "IDEMPOTENCY_CONFLICT", 409);
        }
        if (result.outcome === "conversation_not_found") {
          return sendProblem(reply, request.id, "CONVERSATION_NOT_FOUND", 404);
        }
        accepted = result.execution;
        shouldExecute = result.outcome === "accepted";
      } else {
        accepted = app.runtimeExecutor.accept({
          conversationId: request.params.conversationId,
          requestId: request.id,
          workspaceId: context.workspace.workspaceId,
          requestedBy: context.userId,
        });
      }

      if (shouldExecute && !dependencies.productionRuntime) {
        setImmediate(() => {
          void (async () => {
            const provider = dependencies.workspaceProviderResolver
              ? await dependencies.workspaceProviderResolver(context.workspace.workspaceId)
              : dependencies.textProvider;
            await new RuntimeExecutor(app.executionStore, provider).execute(accepted.executionId, input);
          })().catch(() => undefined);
        });
      }

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

  app.post<{ Params: { conversationId: string }; Body: Buffer }>(
    "/api/v1/conversations/:conversationId/files",
    { schema:{params:routeParamsSchema("conversationId")},preHandler:requireWorkspace },
    async(request,reply)=>{const c=request.authorizationContext;if(!c)return reply;if(!dependencies.attachmentRepository)return sendProblem(reply,request.id,"INTERNAL_SERVER_ERROR",500);
      const contentType=request.headers["content-type"];if(typeof contentType!=="string"||!Buffer.isBuffer(request.body))return sendProblem(reply,request.id,"UNSUPPORTED_FILE_TYPE",415);
      const upload=parseSingleMultipartFile(contentType,request.body);const file=dependencies.attachmentRepository.create(c.workspace.workspaceId,request.params.conversationId,c.userId,upload);return reply.status(201).send(file);},
  );
  app.get<{ Params: { conversationId: string } }>(
    "/api/v1/conversations/:conversationId/files",
    { schema:{params:routeParamsSchema("conversationId")},preHandler:requireWorkspace },
    async(request,reply)=>{const c=request.authorizationContext;if(!c)return reply;const conversation=await dependencies.conversationRepository?.find(c.workspace.workspaceId,request.params.conversationId);if(!conversation||conversation.status!=="active")return sendProblem(reply,request.id,"CONVERSATION_NOT_FOUND",404);return {files:dependencies.attachmentRepository?.list(c.workspace.workspaceId,request.params.conversationId)??[]};},
  );
  app.delete<{ Params: { fileId: string } }>(
    "/api/v1/files/:fileId",
    { schema:{params:routeParamsSchema("fileId")},preHandler:requireWorkspace },
    async(request,reply)=>{const c=request.authorizationContext;if(!c)return reply;const deleted=dependencies.attachmentRepository?.delete(c.workspace.workspaceId,request.params.fileId);return deleted?reply.status(204).send():sendProblem(reply,request.id,"FILE_NOT_FOUND",404);},
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

  app.get<{ Params: { executionId: string }; Querystring: { after?: string } }>(
    "/api/v1/executions/:executionId/events",
    { schema: { params: routeParamsSchema("executionId") }, preHandler: requireWorkspace },
    async (request, reply) => {
      const context = request.authorizationContext; const runtime = dependencies.productionRuntime;
      if (!context || !runtime) return sendProblem(reply, request.id, "EXECUTION_NOT_FOUND", 404);
      const after = /^\d+$/.test(request.query.after ?? "") ? Number(request.query.after) : 0;
      const replay = runtime.replay(context.workspace.workspaceId, request.params.executionId, after);
      if (!replay) return sendProblem(reply, request.id, "EXECUTION_NOT_FOUND", 404);
      reply.hijack();
      metrics.activeSse++;if(after>0)metrics.streamReconnects++;if(replay.replayGap)metrics.replayGaps++;
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive", "X-Accel-Buffering": "no", "X-Request-Id": request.id,
      });
      let cursor = after; let closed = false; let heartbeatAt = Date.now();
      request.raw.once("close", () => { if(!closed){closed = true;metrics.activeSse=Math.max(0,metrics.activeSse-1);} });
      const send = (event: import("@gexor/contracts").ExecutionStreamEvent) => {
        reply.raw.write(`id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`);
        cursor = Math.max(cursor, event.sequence);
      };
      if (replay.replayGap) reply.raw.write(`event: execution.snapshot\ndata: ${JSON.stringify({ replayGap: true, snapshot: replay.snapshot })}\n\n`);
      replay.events.forEach(send);
      while (!closed) {
        const current = runtime.replay(context.workspace.workspaceId, request.params.executionId, cursor);
        if (!current) break;
        current.events.forEach(send);
        if (["completed", "failed", "timed_out", "cancelled"].includes(current.snapshot.state) && current.events.length === 0) break;
        if (Date.now() - heartbeatAt >= 15_000) { reply.raw.write(`: heartbeat ${Date.now()}\n\n`); heartbeatAt = Date.now(); }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!closed) reply.raw.end();
    },
  );

  app.post<{ Params: { executionId: string } }>(
    "/api/v1/executions/:executionId/cancel",
    { schema: { params: routeParamsSchema("executionId") }, preHandler: requireWorkspace },
    async (request, reply) => {
      const context = request.authorizationContext; const runtime = dependencies.productionRuntime;
      if (!context || !runtime) return sendProblem(reply, request.id, "EXECUTION_NOT_FOUND", 404);
      const result = runtime.requestCancellation(context.workspace.workspaceId, request.params.executionId);
      return result ?? sendProblem(reply, request.id, "EXECUTION_NOT_FOUND", 404);
    },
  );

  for (const relationship of ["retry", "regenerate"] as const) {
    app.post<{ Params: { executionId: string } }>(
      `/api/v1/executions/:executionId/${relationship}`,
      { schema: { params: routeParamsSchema("executionId") }, preHandler: requireWorkspace },
      async (request, reply) => {
        const context = request.authorizationContext; const runtime = dependencies.productionRuntime;
        if (!context || !runtime) return sendProblem(reply, request.id, "EXECUTION_NOT_FOUND", 404);
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || !idempotencyKeyPattern.test(key)) return sendProblem(reply, request.id, "IDEMPOTENCY_KEY_REQUIRED", 400);
        const result = runtime.createDerived(context.workspace.workspaceId, context.userId, request.params.executionId, relationship, key, request.id);
        if (result === "not_found") return sendProblem(reply, request.id, "EXECUTION_NOT_FOUND", 404);
        if (result === "not_eligible") return sendProblem(reply, request.id, "EXECUTION_NOT_RETRYABLE", 409);
        return reply.status(202).send(result);
      },
    );
  }

  app.get<{ Params: { workspaceId: string }; Querystring: { from?: string; to?: string } }>(
    "/api/v1/workspaces/:workspaceId/usage",
    { schema: { params: routeParamsSchema("workspaceId") }, preHandler: requireWorkspace },
    async (request, reply) => {
      const context = request.authorizationContext; if (!context || request.params.workspaceId !== context.workspace.workspaceId) return sendProblem(reply, request.id, "WORKSPACE_ACCESS_DENIED", 404);
      const now = new Date(); const from = request.query.from && !Number.isNaN(Date.parse(request.query.from)) ? new Date(request.query.from).toISOString() : new Date(now.getTime() - 30 * 86_400_000).toISOString();
      const to = request.query.to && !Number.isNaN(Date.parse(request.query.to)) ? new Date(request.query.to).toISOString() : now.toISOString();
      return dependencies.productionRuntime?.usageDashboard(context.workspace.workspaceId, from, to) ?? sendProblem(reply, request.id, "INTERNAL_SERVER_ERROR", 500);
    },
  );

  app.patch<{ Params: { workspaceId: string }; Body: { requestLimit?: number; tokenLimit?: number; costLimitMicros?: number } }>(
    "/api/v1/workspaces/:workspaceId/usage/budget",
    { schema: { params: routeParamsSchema("workspaceId"), body: { type: "object", additionalProperties: false, minProperties: 1, properties: { requestLimit: { type: "integer", minimum: 1, maximum: 1000000 }, tokenLimit: { type: "integer", minimum: 1, maximum: 1000000000 }, costLimitMicros: { type: "integer", minimum: 1, maximum: 1000000000000 } } } }, preHandler: requireWorkspace },
    async (request, reply) => {
      const context = request.authorizationContext; if (!context || request.params.workspaceId !== context.workspace.workspaceId) return sendProblem(reply, request.id, "WORKSPACE_ACCESS_DENIED", 404);
      if (!dependencies.productionRuntime) return sendProblem(reply, request.id, "INTERNAL_SERVER_ERROR", 500);
      dependencies.productionRuntime.upsertBudget(context.workspace.workspaceId, request.body);
      const now = new Date(); const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
      return dependencies.productionRuntime.usageDashboard(context.workspace.workspaceId, from, now.toISOString());
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

    if (error instanceof AttachmentValidationError) {
      const status = error.code === "UPLOAD_TOO_LARGE" ? 413 : error.code === "CONVERSATION_NOT_FOUND" ? 404 : 415;
      return sendProblem(reply, request.id, error.code, status);
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
