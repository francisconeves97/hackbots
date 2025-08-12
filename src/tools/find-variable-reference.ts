import { tool } from "ai";
import { z } from "zod";
import { findVariableReferenceByName } from "../utils/find-variable-reference";

const findVariableReferenceByNameTool = tool({
  description:
    "Finds where a variable is defined using TypeScript's compiler API. Given a variable name and its usage location, returns the definition and surrounding code context.",
  inputSchema: z.object({
    filePath: z
      .string()
      .describe("The absolute path to the file containing the variable usage."),
    variableName: z
      .string()
      .describe("The exact name of the variable to find the definition for."),
    startPosition: z.object({
      line: z
        .number()
        .describe(
          "The line number where the variable usage begins (1-indexed)."
        ),
      column: z
        .number()
        .describe(
          "The column number where the variable usage begins (0-indexed)."
        ),
    }),
    endPosition: z.object({
      line: z
        .number()
        .describe("The line number where the variable usage ends (1-indexed)."),
      column: z
        .number()
        .describe(
          "The column number where the variable usage ends (0-indexed)."
        ),
    }),
    linesToRead: z
      .number()
      .describe(
        "The number of lines of context to include around the variable definition (default: 10)."
      )
      .default(10),
  }),
  execute: async ({
    filePath,
    variableName,
    startPosition,
    endPosition,
    linesToRead,
  }) => {
    const result = await findVariableReferenceByName(
      filePath,
      { startPosition, endPosition },
      variableName,
      linesToRead
    );

    return result;
  },
});

export { findVariableReferenceByNameTool };
