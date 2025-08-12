import { runShellCommand } from "../utils/run-shell-command";
import type { ServiceResult } from "./types";

type GetJSFilesRequest = {
  htmlRouteFilePath: string;
  excludeOriginalJSFiles: boolean;
  includeReversedSources: boolean;
};

const getJSFiles = async ({
  htmlRouteFilePath,
  excludeOriginalJSFiles,
  includeReversedSources,
}: GetJSFilesRequest): Promise<ServiceResult<string[]>> => {
  const args = [
    "jxscout",
    "-c",
    "js-files",
    "--html-file-paths",
    htmlRouteFilePath,
  ];

  if (excludeOriginalJSFiles) {
    args.push("--exclude-original");
  }

  if (includeReversedSources) {
    args.push("--include-reversed-sources");
  }

  const { stdout, stderr, exitCode } = await runShellCommand(args);

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

export { getJSFiles };
