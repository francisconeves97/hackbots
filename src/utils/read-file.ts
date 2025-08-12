import { stat } from "fs/promises";
import type { Position } from "../types";

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
    endPosition: Position;
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
  endPosition: Position
): string => {
  const lines = content.split("\n");

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

  if (
    !validatePosition(startPosition, lines.length, startLine.length + 1) ||
    !validatePosition(endPosition, lines.length, endLine.length + 1)
  ) {
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
        location.endPosition
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
