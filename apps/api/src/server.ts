import { buildApp } from "./app.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3001");

const app = buildApp();

try {
  await app.listen({
    host,
    port,
  });

  console.log(`Gexor API listening at http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
