import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const getOllamaModel = (model: string) => {
  if (!Bun.env.OLLAMA_BASE_URL) {
    throw new Error("OLLAMA_BASE_URL is not set");
  }

  const lmstudio = createOpenAICompatible({
    name: "lmstudio",
    baseURL: Bun.env.OLLAMA_BASE_URL,
  });

  return lmstudio(model);
};

export { getOllamaModel };
