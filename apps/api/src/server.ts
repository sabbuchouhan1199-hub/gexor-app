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
import {
  SqliteMessageAcceptanceRepository,
  SqliteRuntimeExecutionStore,
} from "./persistence/sqlite-runtime-repository.js";
import { createTextProvider } from "./providers/provider-factory.js";

async function startServer(): Promise<void> {
  const config = loadApiConfig();
  const database = new SqliteDatabase({ filename: config.databasePath });
  database.migrate();
  const passwordHasher = new PasswordHasher();
  const executionStore = new SqliteRuntimeExecutionStore(database);
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
    messageAcceptanceRepository: new SqliteMessageAcceptanceRepository(database, executionStore),
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
