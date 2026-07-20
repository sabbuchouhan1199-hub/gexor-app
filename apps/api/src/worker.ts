import { loadApiConfig } from "./config.js";
import { SqliteDatabase } from "./persistence/database.js";
import { SqliteProductionRuntimeRepository } from "./persistence/production-runtime-repository.js";
import { type ConnectionHealthChecker, SqliteProviderConnectionRepository, WorkspaceProviderConnectionService } from "./persistence/sqlite-provider-connections.js";
import { SqliteRuntimeExecutionStore } from "./persistence/sqlite-runtime-repository.js";
import { createWorkspaceProvider } from "./providers/provider-factory.js";
import { RuntimeWorker } from "./runtime/runtime-worker.js";

const config = loadApiConfig();
const database = new SqliteDatabase({ filename: config.databasePath });
database.migrate();
const store = new SqliteRuntimeExecutionStore(database);
const runtime = new SqliteProductionRuntimeRepository(database, store);
const connections = new SqliteProviderConnectionRepository(database);
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
const providers = new WorkspaceProviderConnectionService(
  connections,
  async ({ credentialReference }) => credentialReference === "local-env:configured",
  async ({ providerKey, modelId, credentialReference }) => {
    if (credentialReference !== "local-env:configured") throw new Error("The protected credential reference cannot be resolved.");
    return createWorkspaceProvider(config, providerKey, modelId);
  },
  providerHealthChecker,
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
