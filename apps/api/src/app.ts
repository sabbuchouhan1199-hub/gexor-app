import Fastify from "fastify";

import type {
  ChatRequest,
  ChatResponse,
} from "@gexor/contracts";

export function buildApp() {
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
    Reply: ChatResponse;
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
          200: {
            type: "object",
            additionalProperties: false,
            required: ["reply"],
            properties: {
              reply: {
                type: "string",
              },
            },
          },
        },
      },
    },
    async (request) => {
      return {
        reply: `Mock reply: ${request.body.message}`,
      };
    },
  );

  return app;
}
