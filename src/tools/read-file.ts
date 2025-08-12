import { tool } from "ai";
import { z } from "zod";
import { readFile } from "../utils/read-file";

const readFileTool = tool({
  description: "Reads the specified lines from the file.",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to read."),
    startPosition: z.object({
      line: z.number().describe("Line to start reading from (1-indexed)."),
      column: z.number().describe("Column to start reading from (0-indexed)."),
    }),
    linesToRead: z
      .number()
      .describe("Number of lines to read (default: 30).")
      .optional()
      .default(30),
  }),
  execute: async ({ filePath, startPosition, linesToRead }) => {
    const result = await readFile({
      filePath,
      location: {
        startPosition,
        linesToRead,
      },
    });

    return result;
  },
});

export { readFileTool };
