import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from "fastify";

import type {
  ChatRequest,
  ChatResponse,
} from "@gexor/contracts";

type ErrorCode =
  | "VALIDATION_ERROR"
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

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

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });

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
        body: {
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
        },
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
