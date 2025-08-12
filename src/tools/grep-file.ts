import { tool } from "ai";
import { z } from "zod";
import { grepFile } from "../utils/grep-file";

const grepFileTool = tool({
  description:
    "Searches for a regular expression pattern within the content of a file. Returns the lines containing matches along with their line numbers.",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe(
        "The regular expression (regex) pattern to search for within file contents (e.g., 'function\\s+myFunction', 'import\\s+\\{.*\\}\\s+from\\s+.*')."
      ),
    filePath: z.string().describe("The absolute path to the file to search."),
  }),
  execute: async ({ pattern, filePath }) => {
    const result = await grepFile({ pattern, path: filePath });
    return result;
  },
});

export { grepFileTool };
