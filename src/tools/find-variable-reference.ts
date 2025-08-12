import { tool } from "ai";
import { z } from "zod";
import { findVariableReferenceByName } from "../utils/find-variable-reference";

const findVariableReferenceByNameTool = tool({
  description:
    "Returns the location and source code of where a variable was defined. This is a more robust approach than grepping for the variable name. You pass it a start and end position and the variable name you want to find the definition of, and it will return the definition of that variable.",
  inputSchema: z.object({
    filePath: z
      .string()
      .describe("The absolute path to the file where the variable is defined."),
    variableName: z
      .string()
      .describe("The name of the variable to find the definition of."),
    startPosition: z.object({
      line: z
        .number()
        .describe("Starting line number where the variable is being used."),
      column: z
        .number()
        .describe("Starting column number where the variable is being used."),
    }),
    endPosition: z.object({
      line: z.number().describe("Ending line number to stop reading at."),
      column: z.number().describe("Ending column number to stop reading at."),
    }),
    linesToRead: z
      .number()
      .describe(
        "The number of lines to read from the position where the variable was defined."
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
