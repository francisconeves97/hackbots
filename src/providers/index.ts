import { getOllamaModel } from "./ollama";

export const getModel = (provider: string, model: string) => {
  switch (provider) {
    case "ollama":
      return getOllamaModel(model);
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
};
