import { randomUUID } from "node:crypto";

import { toSafeRuntimeFailure } from "../problem-details.js";
import type { SqliteProductionRuntimeRepository } from "../persistence/production-runtime-repository.js";
import type { SqliteRuntimeExecutionStore } from "../persistence/sqlite-runtime-repository.js";
import { ProviderError } from "../providers/errors.js";
import type { TextProvider } from "../providers/provider.js";

export type WorkerProviderResolver = (workspaceId: string, attempt: number) => Promise<TextProvider>;

export class RuntimeWorker {
  readonly workerId: string;
  private stopping = false;

  constructor(
    private readonly runtime: SqliteProductionRuntimeRepository,
    private readonly store: SqliteRuntimeExecutionStore,
    private readonly providerForWorkspace: WorkerProviderResolver,
    options: { workerId?: string } = {},
  ) { this.workerId = options.workerId ?? `worker_${randomUUID()}`; }

  stop(): void { this.stopping = true; }

  async runUntilStopped(pollMs = 250): Promise<void> {
    while (!this.stopping) {
      const worked = await this.runOnce();
      if (!worked) await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  async runOnce(): Promise<boolean> {
    if (this.stopping) return false;
    const job = this.runtime.claim(this.workerId);
    if (!job) return false;
    const before = this.store.get(job.executionId);
    if (!before || ["completed", "failed", "timed_out", "cancelled"].includes(before.state)) {
      this.runtime.finishJob(job.executionId, before?.state === "cancelled" ? "cancelled" : "completed");
      return true;
    }
    const controller = new AbortController();
    const attemptStarted = Date.now();
    let providerName: string | undefined;
    let model: string | undefined;
    const cancellationPoll = setInterval(() => {
      if (this.runtime.isCancellationRequested(job.executionId)) controller.abort();
    }, 200);
    try {
      let execution = before;
      if (execution.state === "accepted") execution = this.store.transition(job.executionId, "preparing")!;
      if (this.runtime.isCancellationRequested(job.executionId)) throw new WorkerCancellationError();
      if (execution.state === "preparing") execution = this.store.transition(job.executionId, "dispatching")!;
      this.runtime.appendEvent(job.executionId, job.workspaceId, "execution.started", { state: "dispatching", attempt: job.attempt });
      const provider = await this.providerForWorkspace(job.workspaceId, job.attempt);
      let text = "";
      if (provider.streamText) {
        for await (const chunk of provider.streamText({ input: job.input, signal: controller.signal })) {
          if (controller.signal.aborted || this.runtime.isCancellationRequested(job.executionId)) throw new WorkerCancellationError();
          providerName = chunk.provider; model = chunk.model;
          if (chunk.delta) {
            text += chunk.delta;
            this.runtime.appendEvent(job.executionId, job.workspaceId, "response.delta", { delta: chunk.delta });
          }
        }
      } else {
        const result = await provider.generateText({ input: job.input, signal: controller.signal });
        providerName = result.provider; model = result.model; text = result.text;
        this.runtime.appendEvent(job.executionId, job.workspaceId, "response.delta", { delta: result.text });
      }
      if (this.runtime.isCancellationRequested(job.executionId)) throw new WorkerCancellationError();
      const completed = this.store.transition(job.executionId, "completed", {
        provider: providerName, model, response: { text },
      })!;
      this.runtime.appendTerminalEvent(completed);
      this.runtime.recordUsage(completed, "estimated", estimateTokens(job.input), estimateTokens(text), Math.max(0, job.attempt - 1));
      this.runtime.recordProviderAttempt({ executionId: job.executionId, workspaceId: job.workspaceId, attemptNumber: job.attempt, providerKey: providerName, modelId: model, outcome: "completed", latencyMs: Date.now() - attemptStarted });
      this.runtime.finishJob(job.executionId, "completed");
    } catch (error) {
      const current = this.store.get(job.executionId);
      if (error instanceof WorkerCancellationError || controller.signal.aborted || this.runtime.isCancellationRequested(job.executionId)) {
        if (current && !["completed", "failed", "timed_out", "cancelled"].includes(current.state)) {
          const cancelled = this.store.transition(job.executionId, "cancelled")!;
          this.runtime.appendTerminalEvent(cancelled);
          this.runtime.recordUsage(cancelled, "unavailable", null, null, Math.max(0, job.attempt - 1));
        }
        this.runtime.recordProviderAttempt({ executionId: job.executionId, workspaceId: job.workspaceId, attemptNumber: job.attempt, providerKey: providerName, modelId: model, outcome: "cancelled", latencyMs: Date.now() - attemptStarted });
        this.runtime.finishJob(job.executionId, "cancelled");
      } else if (error instanceof ProviderError && error.retryable && this.runtime.retryJob(job.executionId, error.code, Math.min(30_000, 500 * (2 ** (job.attempt - 1))))) {
        this.runtime.recordProviderAttempt({ executionId: job.executionId, workspaceId: job.workspaceId, attemptNumber: job.attempt, providerKey: providerName, modelId: model, outcome: "retry_wait", safeFailureCode: error.code, latencyMs: Date.now() - attemptStarted });
        // The execution remains dispatching and is safely leased again for another bounded provider attempt.
      } else if (current && !["completed", "failed", "timed_out", "cancelled"].includes(current.state)) {
        const state = error instanceof ProviderError && error.code === "PROVIDER_TIMEOUT" ? "timed_out" : "failed";
        const failed = this.store.transition(job.executionId, state, { failure: toSafeRuntimeFailure(error) })!;
        this.runtime.appendTerminalEvent(failed);
        this.runtime.recordUsage(failed, "unavailable", null, null, Math.max(0, job.attempt - 1));
        this.runtime.recordProviderAttempt({ executionId: job.executionId, workspaceId: job.workspaceId, attemptNumber: job.attempt, providerKey: providerName, modelId: model, outcome: state, safeFailureCode: failed.failure?.code, latencyMs: Date.now() - attemptStarted });
        this.runtime.finishJob(job.executionId, "dead_letter");
      }
    } finally { clearInterval(cancellationPoll); }
    return true;
  }
}

class WorkerCancellationError extends Error {}
function estimateTokens(text: string): number { return Math.max(1, Math.ceil(text.length / 4)); }
