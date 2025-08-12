import { tool } from "ai";
import { z } from "zod";
import { getOnMessageListeners } from "../services/get-onmessage-listeners";

const getOnmessageListeners = tool({
  description:
    "Gets the onmessage listeners found via static analysis for the given file",
  inputSchema: z.object({
    filePath: z
      .string()
      .describe(
        "The absolute path to the file to get the onmessage listeners for"
      ),
  }),
  execute: async ({ filePath }) => {
    return await getOnMessageListeners(filePath);
  },
});

export { getOnmessageListeners };
