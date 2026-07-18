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
  SqliteProviderConnectionRepository,
  WorkspaceProviderConnectionService,
} from "./persistence/sqlite-provider-connections.js";
import { createTextProvider } from "./providers/provider-factory.js";

async function startServer(): Promise<void> {
  const config = loadApiConfig();
  const database = new SqliteDatabase({ filename: config.databasePath });
  database.migrate();
  const passwordHasher = new PasswordHasher();
  const executionStore = new SqliteRuntimeExecutionStore(database);
  const productionRuntime = new SqliteProductionRuntimeRepository(database, executionStore);
  const attachments = new SqliteAttachmentRepository(database, { root: config.uploadPath, maxBytes: config.maxUploadBytes, maxWorkspaceBytes: config.maxWorkspaceUploadBytes, maxConversationFiles: config.maxConversationFiles });
  const providerConnections = new SqliteProviderConnectionRepository(database);
  const workspaceProviders = new WorkspaceProviderConnectionService(
    providerConnections,
    async ({ providerKey, credentialReference }) =>
      credentialReference === "local-env:configured" && providerKey === config.textProvider,
    async ({ providerKey, modelId, credentialReference }) => {
      if (credentialReference !== "local-env:configured" || providerKey !== config.textProvider) {
        throw new Error("The protected credential reference cannot be resolved.");
      }
      return createTextProvider({
        ...config,
        textProvider: providerKey as typeof config.textProvider,
        ...(providerKey === "ollama" ? { ollamaModel: modelId } : { geminiModel: modelId }),
      });
    },
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
