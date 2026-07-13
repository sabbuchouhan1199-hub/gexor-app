import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from "fastify";

type ChatRequest = {
  message: string;
};

type ChatResponse = {
  reply: string;
};

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

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

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
