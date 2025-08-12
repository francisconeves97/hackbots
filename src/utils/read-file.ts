import { stat } from "fs/promises";
import type { Position } from "../types";

const DEFAULT_MAX_LINES = 2000;

export enum FileError {
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  IS_DIRECTORY = "IS_DIRECTORY",
  INVALID_POSITION = "INVALID_POSITION",
}

type ReadFileResult =
  | {
      success: true;
      data: string;
    }
  | {
      success: false;
      error: {
        code: FileError;
        message: string;
      };
    };

type ReadFileParams = {
  filePath: string;
  location?: {
    startPosition: Position;
    linesToRead: number;
  };
};

const validatePosition = (
  position: Position,
  lineCount: number,
  lineLength: number
): boolean => {
  return (
    position.line >= 1 &&
    position.line <= lineCount &&
    position.column >= 1 &&
    position.column <= lineLength
  );
};

const extractLocation = (
  content: string,
  startPosition: Position,
  linesToRead: number
): string => {
  const lines = content.split("\n").filter((line, index, array) => {
    if (index === array.length - 1 && line === "") {
      return false;
    }
    return true;
  });

  const clampedStartPosition: Position = {
    line: Math.max(1, Math.min(startPosition.line, lines.length)),
    column: Math.max(1, startPosition.column),
  };

  const endLineTmp = Math.min(
    clampedStartPosition.line + linesToRead - 1,
    lines.length
  );
  const endLineContent = lines[endLineTmp - 1];
  const actualEndPosition: Position = {
    line: endLineTmp,
    column: endLineContent ? endLineContent.length + 1 : 1,
  };

  const startLine = lines[clampedStartPosition.line - 1];
  const endLine = lines[actualEndPosition.line - 1];

  if (!startLine || !endLine) {
    return "";
  }

  const clampedStartColumn = Math.min(
    clampedStartPosition.column,
    startLine.length + 1
  );
  const clampedEndColumn = Math.min(
    actualEndPosition.column,
    endLine.length + 1
  );

  if (clampedStartPosition.line === actualEndPosition.line) {
    return startLine.substring(clampedStartColumn - 1, clampedEndColumn);
  }

  const selectedLines = [];
  selectedLines.push(startLine.substring(clampedStartColumn - 1));

  for (let i = clampedStartPosition.line; i < actualEndPosition.line - 1; i++) {
    const line = lines[i];
    if (line !== undefined) {
      selectedLines.push(line);
    }
  }

  selectedLines.push(endLine.substring(0, clampedEndColumn));

  return selectedLines.join("\n");
};

export const readFile = async ({
  filePath,
  location,
}: ReadFileParams): Promise<ReadFileResult> => {
  const stats = await stat(filePath);

  if (stats.isDirectory()) {
    return {
      success: false,
      error: {
        code: FileError.IS_DIRECTORY,
        message: `Path is a directory: ${filePath}`,
      },
    };
  }

  const file = Bun.file(filePath);

  if (!file.exists()) {
    return {
      success: false,
      error: {
        code: FileError.FILE_NOT_FOUND,
        message: `File not found: ${filePath}`,
      },
    };
  }

  const content = await file.text();

  if (location) {
    try {
      const extractedContent = extractLocation(
        content,
        location.startPosition,
        location.linesToRead
      );
      return { success: true, data: extractedContent };
    } catch (error) {
      return {
        success: false,
        error: {
          code: FileError.INVALID_POSITION,
          message:
            error instanceof Error
              ? error.message
              : "Invalid position parameters",
        },
      };
    }
  }

  return { success: true, data: content };
};
