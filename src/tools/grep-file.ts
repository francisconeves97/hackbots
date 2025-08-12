import { tool } from "ai";
import { z } from "zod";
import { getOnMessageListeners } from "../services/get-onmessage-listeners";

const getOnmessageListeners = tool({
  description:
    "Searches for a regular expression pattern within the content of a file Returns the lines containing matches along with their line numbers.",
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
