import { buildApp } from "./app.js";
import { loadApiConfig } from "./config.js";

async function startServer(): Promise<void> {
  const config = loadApiConfig();
  const app = buildApp();

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
