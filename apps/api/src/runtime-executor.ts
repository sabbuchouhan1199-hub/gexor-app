import type { RuntimeExecutionResponse } from "@gexor/contracts";

import { toSafeRuntimeFailure } from "./problem-details.js";
import { ProviderError } from "./providers/errors.js";
import type { TextProvider } from "./providers/provider.js";
import type { RuntimeExecutionStore } from "./runtime-execution-store.js";

export class RuntimeExecutor {
  constructor(
    private readonly store: RuntimeExecutionStore,
    private readonly textProvider: TextProvider,
  ) {}

  accept(options: {
    conversationId: string;
    requestId: string;
    workspaceId?: string;
    requestedBy?: string;
  }): RuntimeExecutionResponse {
    return this.store.create(options);
  }

  async execute(executionId: string, input: string): Promise<RuntimeExecutionResponse> {
    this.store.transition(executionId, "preparing");
    this.store.transition(executionId, "dispatching");

    try {
      const result = await this.textProvider.generateText({ input });
      const completed = this.store.transition(executionId, "completed", {
        provider: result.provider,
        model: result.model,
        response: { text: result.text },
      });
      if (!completed) throw new Error("Runtime execution was not found.");
      return completed;
    } catch (error) {
      const state = error instanceof ProviderError && error.code === "PROVIDER_TIMEOUT"
        ? "timed_out"
        : "failed";
      const failed = this.store.transition(executionId, state, {
        failure: toSafeRuntimeFailure(error),
      });
      if (!failed) throw new Error("Runtime execution was not found.");
      throw error;
    }
  }
}
