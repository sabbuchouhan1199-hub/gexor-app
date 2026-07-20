import type { ApiConfig } from "../config.js";
import {
  GeminiProvider,
  type GeminiProviderOptions,
} from "./gemini-provider.js";
import {
  LlamaCppProvider,
  type LlamaCppProviderOptions,
} from "./llama-cpp-provider.js";
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
      return new OllamaProvider(ollamaOptions(config, dependencies));
    }

    case "gemini": {
      if (!config.geminiApiKey) {
        throw new Error(
          'GEMINI_API_KEY is required when TEXT_PROVIDER is "gemini".',
        );
      }

      return new GeminiProvider(geminiOptions(config, dependencies));
    }

    case "llama-cpp": {
      return new LlamaCppProvider(llamaCppOptions(config, dependencies));
    }

    default:
      return assertNever(config.textProvider);
  }
}

function ollamaOptions(
  config: ApiConfig,
  dependencies: ProviderFactoryDependencies = {},
): OllamaProviderOptions {
  const options: OllamaProviderOptions = {
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    timeoutMs: config.ollamaTimeoutMs,
  };
  if (dependencies.fetchImplementation) {
    options.fetchImplementation = dependencies.fetchImplementation;
  }
  return options;
}

function geminiOptions(
  config: ApiConfig,
  dependencies: ProviderFactoryDependencies = {},
): GeminiProviderOptions {
  const options: GeminiProviderOptions = {
    apiKey: config.geminiApiKey!,
    model: config.geminiModel,
    timeoutMs: config.geminiTimeoutMs,
  };
  if (dependencies.fetchImplementation) {
    options.fetchImplementation = dependencies.fetchImplementation;
  }
  return options;
}

function llamaCppOptions(
  config: ApiConfig,
  dependencies: ProviderFactoryDependencies = {},
): LlamaCppProviderOptions {
  const options: LlamaCppProviderOptions = {
    baseUrl: config.llamaCppBaseUrl,
    model: config.llamaCppModel,
    timeoutMs: config.llamaCppTimeoutMs,
  };
  if (dependencies.fetchImplementation) {
    options.fetchImplementation = dependencies.fetchImplementation;
  }
  return options;
}

export function createWorkspaceProvider(
  config: ApiConfig,
  providerKey: string,
  modelId?: string,
  dependencies: ProviderFactoryDependencies = {},
): TextProvider {
  switch (providerKey) {
    case "ollama": {
      const options = ollamaOptions(config, dependencies);
      if (modelId) options.model = modelId;
      return new OllamaProvider(options);
    }
    case "gemini": {
      if (!config.geminiApiKey) {
        throw new Error('GEMINI_API_KEY is required when creating a Gemini workspace provider.');
      }
      const options = geminiOptions(config, dependencies);
      if (modelId) options.model = modelId;
      return new GeminiProvider(options);
    }
    case "llama-cpp": {
      const options = llamaCppOptions(config, dependencies);
      if (modelId) options.model = modelId;
      return new LlamaCppProvider(options);
    }
    default:
      throw new Error(`Unsupported workspace provider: ${providerKey}`);
  }
}
