import { getLMStudioModel } from "./lmstudio";

export const getModel = (provider: string, model: string) => {
  switch (provider) {
    case "lmstudio":
      return getLMStudioModel(model);
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
};
