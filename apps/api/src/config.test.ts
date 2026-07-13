import assert from "node:assert/strict";
import {
  test,
} from "node:test";

import { loadApiConfig } from "./config.js";

test("configuration uses safe local defaults", () => {
  assert.deepEqual(
    loadApiConfig({}),
    {
      host: "127.0.0.1",
      port: 3001,
    },
  );
});

test("configuration accepts valid environment values", () => {
  assert.deepEqual(
    loadApiConfig({
      HOST: "0.0.0.0",
      PORT: "8080",
    }),
    {
      host: "0.0.0.0",
      port: 8080,
    },
  );
});

test("configuration rejects a nonnumeric port", () => {
  assert.throws(
    () => {
      loadApiConfig({
        PORT: "invalid",
      });
    },
    {
      message:
        "PORT must be a whole number between 1 and 65535.",
    },
  );
});

test("configuration rejects an out-of-range port", () => {
  assert.throws(
    () => {
      loadApiConfig({
        PORT: "70000",
      });
    },
    {
      message:
        "PORT must be a whole number between 1 and 65535.",
    },
  );
});
