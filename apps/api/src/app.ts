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
import { problemDefinitions } from "./problem-details.js";
import type { TextProvider } from "./providers/provider.js";
import { ProviderError } from "./providers/errors.js";
import { RuntimeExecutor } from "./runtime-executor.js";
import { InMemoryRuntimeExecutionStore } from "./runtime-execution-store.js";

export type AppDependencies = {
  textProvider: TextProvider;
  executionStore?: InMemoryRuntimeExecutionStore;
};

declare module "fastify" {
  interface FastifyInstance {
    textProvider: TextProvider;
    executionStore: InMemoryRuntimeExecutionStore;
    runtimeExecutor: RuntimeExecutor;
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

  const executionStore = dependencies.executionStore ?? new InMemoryRuntimeExecutionStore();
  app.decorate("textProvider", dependencies.textProvider);
  app.decorate("executionStore", executionStore);
  app.decorate("runtimeExecutor", new RuntimeExecutor(executionStore, dependencies.textProvider));

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  const healthHandler = async () => ({ status: "ok" as const });
  app.get("/health", healthHandler);
  app.get("/api/v1/health", healthHandler);

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
    },
    async (request, reply) => {
      const accepted = app.runtimeExecutor.accept({
        conversationId: request.params.conversationId,
        requestId: request.id,
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
