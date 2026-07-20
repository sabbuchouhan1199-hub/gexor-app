export type GenerateTextRequest = {
  input: string;
  signal?: AbortSignal;
};

export type GenerateTextResult = {
  provider: string;
  model: string;
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; measured: boolean };
};

export type GenerateTextChunk = {
  provider: string;
  model: string;
  delta: string;
  done: boolean;
  usage?: { inputTokens?: number; outputTokens?: number; measured: boolean };
};

export interface TextProvider {
  generateText(
    request: GenerateTextRequest,
  ): Promise<GenerateTextResult>;
  streamText?(request: GenerateTextRequest): AsyncIterable<GenerateTextChunk>;
}