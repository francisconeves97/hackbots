import { stat } from "fs/promises";
import { glob } from "glob";
import { spawn } from "child_process";
import type { Position } from "../types";

export enum GrepError {
  PATH_NOT_FOUND = "PATH_NOT_FOUND",
  INVALID_PATTERN = "INVALID_PATTERN",
  SEARCH_FAILED = "SEARCH_FAILED",
  GIT_GREP_FAILED = "GIT_GREP_FAILED",
  SYSTEM_GREP_FAILED = "SYSTEM_GREP_FAILED",
}

export type GrepMatch = {
  filePath: string;
  lineNumber: number;
  line: string;
  column?: number;
  location?: {
    startPosition: Position;
    endPosition: Position;
  };
};

type GrepResult =
  | {
      success: true;
      data: GrepMatch[];
    }
  | {
      success: false;
      error: {
        code: GrepError;
        message: string;
      };
    };

type GrepParams = {
  pattern: string;
  path: string;
  include?: string;
  exclude?: string[];
  caseSensitive?: boolean;
};

const isGitRepository = async (path: string): Promise<boolean> => {
  try {
    const gitDir = Bun.file(`${path}/.git`);
    return await gitDir.exists();
  } catch {
    return false;
  }
};

const isCommandAvailable = async (command: string): Promise<boolean> => {
  try {
    const process = Bun.spawn(["which", command]);
    const exitCode = await process.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
};

const parseGrepOutput = (output: string, basePath: string): GrepMatch[] => {
  if (!output.trim()) return [];

  const matches: GrepMatch[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.match(/^([^:]+):(\d+):(.+)$/);
    if (match) {
      const [, filePath, lineNumber, content] = match;
      if (filePath && lineNumber && content) {
        let relativePath = filePath;

        // Only make relative if we have a base path and the file path starts with it
        if (basePath && filePath.startsWith(basePath + "/")) {
          relativePath = filePath.replace(basePath + "/", "");
        } else if (basePath && filePath === basePath) {
          // For single files, use just the filename
          relativePath = filePath.split("/").pop() || filePath;
        }

        // For system/git grep, we don't have exact column information
        // so we'll set a default location spanning the entire line
        const lineNum = parseInt(lineNumber, 10);
        matches.push({
          filePath: relativePath,
          lineNumber: lineNum,
          line: content,
          column: 1, // Default to start of line
          location: {
            startPosition: {
              line: lineNum,
              column: 1,
            },
            endPosition: {
              line: lineNum,
              column: content.length + 1,
            },
          },
        });
      }
    }
  }

  return matches;
};

const validatePattern = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const searchInFile = async (
  filePath: string,
  pattern: string,
  caseSensitive: boolean
): Promise<GrepMatch[]> => {
  const matches: GrepMatch[] = [];

  try {
    const file = Bun.file(filePath);
    if (!file.exists()) {
      return matches;
    }

    const content = await file.text();
    const lines = content.split(/\r?\n/);
    const regex = new RegExp(pattern, caseSensitive ? "g" : "gi");

    lines.forEach((line, index) => {
      let match;
      while ((match = regex.exec(line)) !== null) {
        const startColumn = match.index + 1;
        const endColumn = match.index + match[0].length;

        matches.push({
          filePath,
          lineNumber: index + 1,
          line,
          column: startColumn,
          location: {
            startPosition: {
              line: index + 1,
              column: startColumn,
            },
            endPosition: {
              line: index + 1,
              column: endColumn,
            },
          },
        });
      }
    });
  } catch (error) {
    // Silently ignore file read errors
  }

  return matches;
};

const getFilesToSearch = async (
  path: string,
  include?: string,
  exclude?: string[]
): Promise<string[]> => {
  const defaultExclude = [
    ".git/**",
    "node_modules/**",
    "bower_components/**",
    ".svn/**",
    ".hg/**",
    "dist/**",
    "build/**",
    "coverage/**",
  ];

  const ignorePatterns = [...(exclude || []), ...defaultExclude];
  const globPattern = include || "**/*";

  try {
    const files = await glob(globPattern, {
      cwd: path,
      dot: true,
      ignore: ignorePatterns,
      absolute: true,
      nodir: true,
    });

    return files as string[];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return [];
  }
};

const extractLocationFromFile = async (
  filePath: string,
  startPosition: Position,
  endPosition: Position
): Promise<string> => {
  try {
    const file = Bun.file(filePath);
    if (!file.exists()) {
      throw new Error("File not found");
    }

    const content = await file.text();
    const lines = content.split(/\r?\n/);

    if (
      startPosition.line > endPosition.line ||
      (startPosition.line === endPosition.line &&
        startPosition.column > endPosition.column)
    ) {
      throw new Error("Start position must be before end position");
    }

    const startLine = lines[startPosition.line - 1];
    const endLine = lines[endPosition.line - 1];

    if (!startLine || !endLine) {
      throw new Error("Position out of bounds");
    }

    if (startPosition.line === endPosition.line) {
      return startLine.substring(startPosition.column - 1, endPosition.column);
    }

    const selectedLines = [];
    selectedLines.push(startLine.substring(startPosition.column - 1));

    for (let i = startPosition.line; i < endPosition.line - 1; i++) {
      const line = lines[i];
      if (line !== undefined) {
        selectedLines.push(line);
      }
    }

    selectedLines.push(endLine.substring(0, endPosition.column));

    return selectedLines.join("\n");
  } catch (error) {
    throw new Error(
      `Failed to extract location: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

export const grepFile = async ({
  pattern,
  path,
  include,
  exclude,
  caseSensitive = false,
}: GrepParams): Promise<GrepResult> => {
  if (!validatePattern(pattern)) {
    return {
      success: false,
      error: {
        code: GrepError.INVALID_PATTERN,
        message: `Invalid regex pattern: ${pattern}`,
      },
    };
  }

  try {
    const stats = await stat(path);

    if (!stats.isDirectory() && !stats.isFile()) {
      return {
        success: false,
        error: {
          code: GrepError.PATH_NOT_FOUND,
          message: `Path does not exist or is not accessible: ${path}`,
        },
      };
    }

    const isDirectory = stats.isDirectory();
    const isFile = stats.isFile();

    // Strategy 1: System grep (if strategy is auto or system)
    const grepAvailable = await isCommandAvailable("grep");

    if (grepAvailable) {
      try {
        const grepArgs = ["-n", "-H", "-E"];

        if (!caseSensitive) {
          grepArgs.push("-i");
        }

        if (isDirectory) {
          grepArgs.push("-r");
          const commonExcludes = [".git", "node_modules", "bower_components"];
          commonExcludes.forEach((dir) =>
            grepArgs.push(`--exclude-dir=${dir}`)
          );

          if (include) {
            grepArgs.push(`--include=${include}`);
          }

          grepArgs.push(pattern);
          grepArgs.push(".");
        } else {
          // Single file
          grepArgs.push(pattern);
          grepArgs.push(path);
        }

        const process = Bun.spawn(grepArgs, {
          cwd: isDirectory ? path : undefined,
          stdout: "pipe",
          stderr: "pipe",
        });

        const output = await new Response(process.stdout).text();
        const stderr = await new Response(process.stderr).text();
        const exitCode = await process.exited;

        if (exitCode === 0 || exitCode === 1) {
          const matches = parseGrepOutput(output, isDirectory ? path : "");
          return { success: true, data: matches };
        } else {
          throw new Error(`system grep failed: ${stderr}`);
        }
      } catch (error) {}
      // fall through to next strategy
    }

    // Strategy 2: JavaScript fallback
    let files: string[] = [];

    if (isDirectory) {
      files = await getFilesToSearch(path, include, exclude);
    } else {
      // Single file
      files = [path];
    }

    const allMatches: GrepMatch[] = [];

    for (const filePath of files) {
      try {
        const matches = await searchInFile(filePath, pattern, caseSensitive);
        allMatches.push(...matches);
      } catch (error) {
        // Continue with other files if one fails
        continue;
      }
    }

    return { success: true, data: allMatches };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    return {
      success: false,
      error: {
        code: GrepError.SEARCH_FAILED,
        message: error instanceof Error ? error.message : "Search failed",
      },
    };
  }
};

export const extractFromGrepMatch = async (
  match: GrepMatch,
  basePath?: string
): Promise<string> => {
  if (!match.location) {
    throw new Error("Match does not have location information");
  }

  // If the filePath is already absolute or doesn't need basePath, use it as is
  const fullPath =
    basePath && !match.filePath.startsWith("/")
      ? `${basePath}/${match.filePath}`
      : match.filePath;

  return extractLocationFromFile(
    fullPath,
    match.location.startPosition,
    match.location.endPosition
  );
};
