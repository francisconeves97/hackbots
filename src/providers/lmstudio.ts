import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const getLMStudioModel = (model: string) => {
  if (!Bun.env.LMSTUDIO_BASE_URL) {
    throw new Error("LMSTUDIO_BASE_URL is not set");
  }

  const lmstudio = createOpenAICompatible({
    name: "lmstudio",
    baseURL: Bun.env.LMSTUDIO_BASE_URL,
  });

  return lmstudio(model);
};

export { getLMStudioModel };
