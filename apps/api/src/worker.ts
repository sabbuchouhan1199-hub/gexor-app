import { loadApiConfig } from "./config.js";
import { SqliteDatabase } from "./persistence/database.js";
import { SqliteProductionRuntimeRepository } from "./persistence/production-runtime-repository.js";
import { SqliteProviderConnectionRepository, WorkspaceProviderConnectionService } from "./persistence/sqlite-provider-connections.js";
import { SqliteRuntimeExecutionStore } from "./persistence/sqlite-runtime-repository.js";
import { createTextProvider } from "./providers/provider-factory.js";
import { RuntimeWorker } from "./runtime/runtime-worker.js";

const config = loadApiConfig();
const database = new SqliteDatabase({ filename: config.databasePath });
database.migrate();
const store = new SqliteRuntimeExecutionStore(database);
const runtime = new SqliteProductionRuntimeRepository(database, store);
const connections = new SqliteProviderConnectionRepository(database);
const providers = new WorkspaceProviderConnectionService(
  connections,
  async ({ providerKey, credentialReference }) => credentialReference === "local-env:configured" && providerKey === config.textProvider,
  async ({ providerKey, modelId, credentialReference }) => {
    if (credentialReference !== "local-env:configured" || providerKey !== config.textProvider) throw new Error("The protected credential reference cannot be resolved.");
    return createTextProvider({ ...config, textProvider: providerKey as typeof config.textProvider,
      ...(providerKey === "ollama" ? { ollamaModel: modelId } : { geminiModel: modelId }) });
  },
);
const worker = new RuntimeWorker(runtime, store, (workspaceId, attempt) => providers.providerForWorkspace(workspaceId, attempt));
let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return; stopping = true; worker.stop(); database.close();
}
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
void worker.runUntilStopped().catch(() => {
  console.error(JSON.stringify({ level: "error", event: "worker.failed", code: "WORKER_FAILED" }));
  process.exitCode = 1; void shutdown();
});
