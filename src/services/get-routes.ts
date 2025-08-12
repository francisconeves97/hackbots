import { runShellCommand } from "../utils/run-shell-command";
import type { ServiceResult } from "./types";

const getRoutes = async (): Promise<ServiceResult<string[]>> => {
  const { stdout, stderr, exitCode } = await runShellCommand([
    "jxscout",
    "-c",
    "routes",
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

  const result = lines.filter((line) => line);

  return {
    success: true,
    data: result,
  };
};

export { getRoutes };
