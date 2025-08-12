import ts from "typescript";
import type { Position } from "../types";

export interface VariableReference {
  file: string;
  line: number;
  character: number;
}

export interface FindVariableReferenceResult {
  success: boolean;
  data?: VariableReference;
  error?: string;
}

export interface PositionRange {
  startPosition: Position;
  endPosition: Position;
}

export interface VariableReferenceWithContent {
  file: string;
  content: string;
  startPosition: Position;
  endPosition: Position;
}

export interface FindVariableReferenceWithContentResult {
  success: boolean;
  data?: VariableReferenceWithContent;
  error?: string;
}

const MAX_LINES_TO_READ = 2000 as const;

export function findVariableReferenceByName(
  filePath: string,
  positionRange: PositionRange,
  variableName: string,
  linesToRead: number = 10
): FindVariableReferenceWithContentResult {
  try {
    if (linesToRead > MAX_LINES_TO_READ) {
      return {
        success: false,
        error: `Lines to read (${linesToRead}) exceeds maximum allowed (${MAX_LINES_TO_READ})`,
      };
    }

    const program = ts.createProgram([filePath], {});
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return {
        success: false,
        error: "Source file not found",
      };
    }

    const checker = program.getTypeChecker();

    let startPos: number;
    let endPos: number;

    try {
      startPos = ts.getPositionOfLineAndCharacter(
        sourceFile,
        positionRange.startPosition.line - 1,
        positionRange.startPosition.column
      );
      endPos = ts.getPositionOfLineAndCharacter(
        sourceFile,
        positionRange.endPosition.line - 1,
        positionRange.endPosition.column
      );
    } catch (error) {
      return {
        success: false,
        error: `Invalid position range: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }

    function findVariableInRange(node: ts.Node): ts.Node | undefined {
      const nodeStart = node.getStart();
      const nodeEnd = node.getEnd();

      if (ts.isIdentifier(node)) {
        if (
          node.text === variableName &&
          nodeStart >= startPos &&
          nodeEnd <= endPos
        ) {
          return node;
        }
      }

      return ts.forEachChild(node, findVariableInRange);
    }

    const variableNode = findVariableInRange(sourceFile);
    if (!variableNode) {
      return {
        success: false,
        error: `Variable '${variableName}' not found in the specified range`,
      };
    }

    const symbol = checker.getSymbolAtLocation(variableNode);
    if (!symbol) {
      return {
        success: false,
        error: `No symbol found for variable '${variableName}'`,
      };
    }

    const declarations = symbol.getDeclarations();
    if (!declarations || declarations.length === 0) {
      return {
        success: false,
        error: `No declarations found for variable '${variableName}'`,
      };
    }

    const decl = declarations[0];
    if (!decl) {
      return {
        success: false,
        error: "No declaration found",
      };
    }

    const declFile = decl.getSourceFile().fileName;
    let declPos: ts.LineAndCharacter;
    try {
      declPos = ts.getLineAndCharacterOfPosition(
        decl.getSourceFile(),
        decl.getStart()
      );
    } catch (error) {
      return {
        success: false,
        error: "Failed to get declaration position",
      };
    }

    const fileContent = sourceFile.getFullText();
    const lines = fileContent.split("\n");
    const referenceLine = declPos.line + 1;

    const startLine = Math.max(1, referenceLine - Math.floor(linesToRead / 2));
    const endLine = Math.min(lines.length, startLine + linesToRead - 1);

    const contentLines = lines.slice(startLine - 1, endLine);
    const content = contentLines.join("\n");

    const startPosition: Position = {
      line: startLine,
      column: 0,
    };

    const endPosition: Position = {
      line: endLine,
      column: lines[endLine - 1]?.length || 0,
    };

    return {
      success: true,
      data: {
        file: declFile,
        content,
        startPosition,
        endPosition,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
