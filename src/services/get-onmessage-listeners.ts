import { runShellCommand } from "../utils/run-shell-command";
import type { DescriptorWithCodeLocation, ServiceResult } from "./types";

const getOnMessageListeners = async (
  filePath: string
): Promise<ServiceResult<DescriptorWithCodeLocation[]>> => {
  const { stdout, stderr, exitCode } = await runShellCommand([
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

  if (stdout.length === 0) {
    return {
      success: true,
      data: [],
    };
  }

  const lines = stdout.split("\n");

  const result = lines.filter((line) => line).map((line) => JSON.parse(line));

  return {
    success: true,
    data: result,
  };
};

export { getOnMessageListeners };
