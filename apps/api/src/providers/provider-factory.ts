import type { ApiConfig } from "../config.js";
import {
  GeminiProvider,
  type GeminiProviderOptions,
} from "./gemini-provider.js";
import {
  OllamaProvider,
  type OllamaProviderOptions,
} from "./ollama-provider.js";
import type { TextProvider } from "./provider.js";

export type ProviderFactoryDependencies = {
  fetchImplementation?: typeof fetch;
};

function assertNever(value: never): never {
  throw new Error(
    `Unsupported text provider: ${String(value)}`,
  );
}

export function createTextProvider(
  config: ApiConfig,
  dependencies: ProviderFactoryDependencies = {},
): TextProvider {
  switch (config.textProvider) {
    case "ollama": {
      const options: OllamaProviderOptions = {
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel,
        timeoutMs: config.ollamaTimeoutMs,
      };

      if (dependencies.fetchImplementation) {
        options.fetchImplementation =
          dependencies.fetchImplementation;
      }

      return new OllamaProvider(options);
    }

    case "gemini": {
      if (!config.geminiApiKey) {
        throw new Error(
          'GEMINI_API_KEY is required when TEXT_PROVIDER is "gemini".',
        );
      }

      const options: GeminiProviderOptions = {
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
        timeoutMs: config.geminiTimeoutMs,
      };

      if (dependencies.fetchImplementation) {
        options.fetchImplementation =
          dependencies.fetchImplementation;
      }

      return new GeminiProvider(options);
    }

    default:
      return assertNever(config.textProvider);
  }
}
