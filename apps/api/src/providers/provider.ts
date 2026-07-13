export type GenerateTextRequest = {
  input: string;
};

export type GenerateTextResult = {
  provider: string;
  model: string;
  text: string;
};

export interface TextProvider {
  generateText(
    request: GenerateTextRequest,
  ): Promise<GenerateTextResult>;
}