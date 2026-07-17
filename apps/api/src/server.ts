import { buildApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { createTextProvider } from "./providers/provider-factory.js";

async function startServer(): Promise<void> {
  const config = loadApiConfig();
  const textProvider =
    createTextProvider(config);
  const app = buildApp({
    textProvider,
  });

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void startServer();
