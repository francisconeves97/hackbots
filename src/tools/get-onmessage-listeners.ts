import { tool } from "ai";
import { z } from "zod";
import { runCLI } from "../lib/run-cli";

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
    const { stdout, stderr, exitCode } = await runCLI([
      "jxscout",
      "-c",
      "descriptors",
      "--descriptor-types",
      "onmessage-listeners",
      "--file-paths",
      filePath,
      "--include-code-location",
    ]);

    if (exitCode !== 0) {
      return {
        success: false,
        error: stderr,
      };
    }

    return {
      success: true,
      onmessageListeners: stdout.split("\n"),
    };
  },
});

export { getOnmessageListeners };
