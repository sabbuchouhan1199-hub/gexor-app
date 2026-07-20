import { buildApp } from "./app.js";
import { PasswordHasher } from "./auth/password-hasher.js";
import { InMemoryRuntimeExecutionStore } from "./runtime-execution-store.js";
import { loadApiConfig } from "./config.js";
import { SqliteDatabase } from "./persistence/database.js";
import {
  SqliteConversationRepository,
  SqliteIdentityRepository,
  SqliteSessionRepository,
  SqliteWorkspaceRepository,
} from "./persistence/sqlite-repositories.js";
import { SqliteRegistrationService } from "./persistence/sqlite-registration-service.js";
import { SqliteAttachmentRepository } from "./persistence/attachment-repository.js";
import { SqliteProductionRuntimeRepository } from "./persistence/production-runtime-repository.js";
import {
  SqliteMessageAcceptanceRepository,
  SqliteRuntimeExecutionStore,
} from "./persistence/sqlite-runtime-repository.js";
import {
  type ConnectionHealthChecker,
  SqliteProviderConnectionRepository,
  WorkspaceProviderConnectionService,
} from "./persistence/sqlite-provider-connections.js";
import { createTextProvider, createWorkspaceProvider } from "./providers/provider-factory.js";

async function startServer(): Promise<void> {
  const config = loadApiConfig();
  const database = new SqliteDatabase({ filename: config.databasePath });
  database.migrate();
  const passwordHasher = new PasswordHasher();
  const executionStore = new SqliteRuntimeExecutionStore(database);
  const productionRuntime = new SqliteProductionRuntimeRepository(database, executionStore);
  const attachments = new SqliteAttachmentRepository(database, { root: config.uploadPath, maxBytes: config.maxUploadBytes, maxWorkspaceBytes: config.maxWorkspaceUploadBytes, maxConversationFiles: config.maxConversationFiles });
  const providerConnections = new SqliteProviderConnectionRepository(database);
  const providerHealthChecker: ConnectionHealthChecker = async ({ providerKey }) => {
    switch (providerKey) {
      case "llama-cpp": {
        const baseUrl = config.llamaCppBaseUrl.replace(/\/v1$/i, "");
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
        return res.ok;
      }
      case "ollama": {
        const res = await fetch(config.ollamaBaseUrl, { signal: AbortSignal.timeout(5_000) });
        return res.ok;
      }
      case "gemini": {
        if (!config.geminiApiKey) return false;
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
          headers: { "x-goog-api-key": config.geminiApiKey },
          signal: AbortSignal.timeout(5_000),
        });
        return res.ok;
      }
      default:
        return false;
    }
  };
  const workspaceProviders = new WorkspaceProviderConnectionService(
    providerConnections,
    async ({ credentialReference }) =>
      credentialReference === "local-env:configured",
    async ({ providerKey, modelId, credentialReference }) => {
      if (credentialReference !== "local-env:configured") {
        throw new Error("The protected credential reference cannot be resolved.");
      }
      return createWorkspaceProvider(config, providerKey, modelId);
    },
    providerHealthChecker,
  );
  const app = buildApp({
    textProvider: createTextProvider(config),
    executionStore,
    compatibilityExecutionStore: new InMemoryRuntimeExecutionStore(),
    identityRepository: new SqliteIdentityRepository(database),
    sessionRepository: new SqliteSessionRepository(database),
    workspaceRepository: new SqliteWorkspaceRepository(database),
    passwordHasher,
    atomicRegistration: new SqliteRegistrationService(database, { passwordHasher }),
    conversationRepository: new SqliteConversationRepository(database),
    messageAcceptanceRepository: new SqliteMessageAcceptanceRepository(database, executionStore, { durableRuntime: productionRuntime }),
    productionRuntime,
    attachmentRepository: attachments,
    providerConnectionRepository: providerConnections,
    providerConnectionService: workspaceProviders,
    workspaceProviderResolver: (workspaceId) => workspaceProviders.providerForWorkspace(workspaceId),
    authCookies: { secure: config.cookieSecure, ...(config.allowedOrigin ? { allowedOrigin: config.allowedOrigin } : {}) },
    structuredLogging: config.cookieSecure,
    readiness: () => Boolean(database.prepare("SELECT 1 AS ready").get()),
  });
  app.addHook("onClose", async () => database.close());

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
}

void startServer();
