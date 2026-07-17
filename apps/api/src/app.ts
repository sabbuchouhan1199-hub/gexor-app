import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from "fastify";

import type {
  ChatRequest,
  ChatResponse,
} from "@gexor/contracts";
import type { TextProvider } from "./providers/provider.js";
import {
  ProviderError,
  type ProviderErrorCode,
} from "./providers/errors.js";

export type AppDependencies = {
  textProvider: TextProvider;
};

declare module "fastify" {
  interface FastifyInstance {
    textProvider: TextProvider;
  }
}

type ErrorCode =
  | "VALIDATION_ERROR"
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_SERVER_ERROR"
  | ProviderErrorCode;

type ErrorResponse = {
  error: {
    code: ErrorCode;
    message: string;
    status: number;
  };
};

const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: {
    status: {
      type: "string",
      const: "ok",
    },
  },
} as const;

const chatResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: {
    reply: {
      type: "string",
    },
  },
} as const;

const chatRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: {
      type: "string",
      minLength: 1,
      maxLength: 4000,
      pattern: "\\S",
    },
  },
} as const;

const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "status"],
      properties: {
        code: {
          type: "string",
          enum: [
            "VALIDATION_ERROR",
            "ROUTE_NOT_FOUND",
            "INTERNAL_SERVER_ERROR",
            "PROVIDER_AUTHENTICATION_FAILED",
            "PROVIDER_MODEL_NOT_FOUND",
            "PROVIDER_RATE_LIMITED",
            "PROVIDER_TIMEOUT",
            "PROVIDER_UNAVAILABLE",
            "PROVIDER_INVALID_RESPONSE",
          ],
        },
        message: {
          type: "string",
        },
        status: {
          type: "integer",
        },
      },
    },
  },
} as const;

function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
): ErrorResponse {
  return {
    error: {
      code,
      message,
      status,
    },
  };
}

export function buildApp(
  dependencies: AppDependencies,
): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });

  app.decorate(
    "textProvider",
    dependencies.textProvider,
  );

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: healthResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async () => {
      return {
        status: "ok",
      };
    },
  );

  app.post<{
    Body: ChatRequest;
    Reply: ChatResponse | ErrorResponse;
  }>(
    "/mock/chat",
    {
      schema: {
        body: chatRequestSchema,
        response: {
          200: chatResponseSchema,
          400: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return {
        reply: `Mock reply: ${request.body.message.trim()}`,
      };
    },
  );

  app.post<{
    Body: ChatRequest;
    Reply: ChatResponse | ErrorResponse;
  }>(
    "/chat",
    {
      schema: {
        body: chatRequestSchema,
        response: {
          200: chatResponseSchema,
          400: errorResponseSchema,
          500: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
          504: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const result =
        await app.textProvider.generateText({
          input: request.body.message.trim(),
        });

      return {
        reply: result.text,
      };
    },
  );

  app.setNotFoundHandler(async (_request, reply) => {
    return reply
      .status(404)
      .send(
        createErrorResponse(
          "ROUTE_NOT_FOUND",
          "The requested route was not found.",
          404,
        ),
      );
  });

  app.setErrorHandler(
    async (
      error: FastifyError,
      _request,
      reply,
    ) => {
      if (error.validation) {
        return reply
          .status(400)
          .send(
            createErrorResponse(
              "VALIDATION_ERROR",
              "Request validation failed.",
              400,
            ),
          );
      }

      if (error instanceof ProviderError) {
        return reply
          .status(error.status)
          .send(
            createErrorResponse(
              error.code,
              error.message,
              error.status,
            ),
          );
      }

      app.log.error(error);

      return reply
        .status(500)
        .send(
          createErrorResponse(
            "INTERNAL_SERVER_ERROR",
            "An unexpected server error occurred.",
            500,
          ),
        );
    },
  );

  return app;
}
