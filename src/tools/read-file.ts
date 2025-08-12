import { tool } from "ai";
import { z } from "zod";
import { GrepError, grepFile } from "../utils/grep-file";
import { readFile } from "../utils/read-file";

const readFileTool = tool({
  description:
    "Reads the specified range of lines from the file. Instead of passing an end position, can pass a number of lines to read.",
  inputSchema: z.object({
    filePath: z.string().describe("The absolute path to the file to read."),
    startPosition: z.object({
      line: z.number().describe("The line number to start reading from."),
      column: z.number().describe("The column number to start reading from."),
    }),
    endPosition: z
      .object({
        line: z.number().describe("The line number to stop reading at."),
        column: z.number().describe("The column number to stop reading at."),
      })
      .optional(),
    linesToRead: z.number().describe("The number of lines to read.").optional(),
  }),
  execute: async ({ filePath, startPosition, endPosition, linesToRead }) => {
    if (endPosition && linesToRead) {
      return {
        success: false,
        error: {
          code: "WRONG_PARAMETERS",
          message: "Can only pass one of endPosition or linesToRead",
        },
      };
    }

    if (!endPosition && !linesToRead) {
      return {
        success: false,
        error: {
          code: "WRONG_PARAMETERS",
          message: "Must pass one of endPosition or linesToRead",
        },
      };
    }

    const result = await readFile({
      filePath,
      location: {
        startPosition,
        endPosition,
        linesToRead,
      },
    });

    return result;
  },
});

export { readFileTool };
