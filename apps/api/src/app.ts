import { randomUUID } from "node:crypto";

import Fastify, { type FastifyError, type FastifyInstance } from "fastify";

import type {
  ApiProblem,
  ApiProblemCode,
  ChatRequest,
  ChatResponse,
  MessageSubmissionRequest,
  MessageSubmissionResponse,
  RuntimeExecutionResponse,
} from "@gexor/contracts";
import type { TextProvider } from "./providers/provider.js";
import { ProviderError } from "./providers/errors.js";
import { InMemoryRuntimeExecutionStore } from "./runtime-execution-store.js";

export type AppDependencies = {
  textProvider: TextProvider;
  executionStore?: InMemoryRuntimeExecutionStore;
};

declare module "fastify" {
  interface FastifyInstance {
    textProvider: TextProvider;
    executionStore: InMemoryRuntimeExecutionStore;
  }
}

const problemContentType = "application/problem+json";
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const chatRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 4000, pattern: "\\S" },
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
      maxItems: 20,
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

const problemDefinitions: Record<ApiProblemCode, {
  type: string;
  title: string;
  detail: string;
  retryable: boolean;
}> = {
  VALIDATION_ERROR: {
    type: "https://docs.gexor/errors/validation-error",
    title: "Validation error",
    detail: "Request validation failed.",
    retryable: false,
  },
  ROUTE_NOT_FOUND: {
    type: "https://docs.gexor/errors/route-not-found",
    title: "Route not found",
    detail: "The requested route was not found.",
    retryable: false,
  },
  EXECUTION_NOT_FOUND: {
    type: "https://docs.gexor/errors/execution-not-found",
    title: "Execution not found",
    detail: "The requested execution was not found.",
    retryable: false,
  },
  INTERNAL_SERVER_ERROR: {
    type: "https://docs.gexor/errors/internal-server-error",
    title: "Internal server error",
    detail: "An unexpected server error occurred.",
    retryable: false,
  },
  PROVIDER_AUTHENTICATION_FAILED: {
    type: "https://docs.gexor/errors/provider-authentication-failed",
    title: "Provider authentication failed",
    detail: "The provider request could not be authenticated.",
    retryable: false,
  },
  PROVIDER_MODEL_NOT_FOUND: {
    type: "https://docs.gexor/errors/provider-model-not-found",
    title: "Provider model not found",
    detail: "The configured provider model is unavailable.",
    retryable: false,
  },
  PROVIDER_RATE_LIMITED: {
    type: "https://docs.gexor/errors/provider-rate-limited",
    title: "Provider rate limited",
    detail: "The provider temporarily rejected the request.",
    retryable: true,
  },
  PROVIDER_TIMEOUT: {
    type: "https://docs.gexor/errors/provider-timeout",
    title: "Provider timeout",
    detail: "The provider request timed out.",
    retryable: true,
  },
  PROVIDER_UNAVAILABLE: {
    type: "https://docs.gexor/errors/provider-unavailable",
    title: "Provider unavailable",
    detail: "The provider is unavailable.",
    retryable: true,
  },
  PROVIDER_INVALID_RESPONSE: {
    type: "https://docs.gexor/errors/provider-invalid-response",
    title: "Invalid provider response",
    detail: "The provider returned an invalid response.",
    retryable: true,
  },
};

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

function safeValidationErrors(error: FastifyError): ApiProblem["errors"] {
  return error.validation?.map((issue) => ({
    path: issue.instancePath || "/",
    message: issue.keyword === "additionalProperties"
      ? "Unknown fields are not allowed."
      : issue.message ?? "Invalid value.",
  }));
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

  app.decorate("textProvider", dependencies.textProvider);
  app.decorate("executionStore", dependencies.executionStore ?? new InMemoryRuntimeExecutionStore());

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: ChatRequest; Reply: ChatResponse | ApiProblem }>(
    "/mock/chat",
    { schema: { body: chatRequestSchema } },
    async (request) => ({ reply: `Mock reply: ${request.body.message.trim()}` }),
  );

  app.post<{ Body: ChatRequest; Reply: ChatResponse | ApiProblem }>(
    "/chat",
    { schema: { body: chatRequestSchema } },
    async (request) => {
      const result = await app.textProvider.generateText({ input: request.body.message.trim() });
      return { reply: result.text };
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
    },
    async (request, reply) => {
      const execution = app.executionStore.create(request.params.conversationId);
      return reply.status(202).send({
        messageId: execution.messageId,
        executionId: execution.id,
        state: execution.state,
        requestId: request.id,
        createdAt: execution.createdAt,
        links: { execution: execution.links.self },
      });
    },
  );

  app.get<{
    Params: { executionId: string };
    Reply: RuntimeExecutionResponse | ApiProblem;
  }>(
    "/api/v1/executions/:executionId",
    { schema: { params: routeParamsSchema("executionId") } },
    async (request, reply) => {
      const execution = app.executionStore.get(request.params.executionId);
      if (execution) return execution;
      return reply
        .status(404)
        .type(problemContentType)
        .send(createProblem("EXECUTION_NOT_FOUND", 404, request.id));
    },
  );

  app.setNotFoundHandler(async (request, reply) => reply
    .status(404)
    .type(problemContentType)
    .send(createProblem("ROUTE_NOT_FOUND", 404, request.id)));

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply
        .status(400)
        .type(problemContentType)
        .send(createProblem("VALIDATION_ERROR", 400, request.id, {
          errors: safeValidationErrors(error),
        }));
    }

    if (error instanceof ProviderError) {
      return reply
        .status(error.status)
        .type(problemContentType)
        .send(createProblem(error.code, error.status, request.id, {
          retryable: error.retryable,
        }));
    }

    app.log.error(error);
    return reply
      .status(500)
      .type(problemContentType)
      .send(createProblem("INTERNAL_SERVER_ERROR", 500, request.id));
  });

  return app;
}
