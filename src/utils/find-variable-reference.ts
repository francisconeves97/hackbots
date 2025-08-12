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

export function findVariableReferenceByName(
  filePath: string,
  positionRange: PositionRange,
  variableName: string
): FindVariableReferenceResult {
  try {
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

    return {
      success: true,
      data: {
        file: declFile,
        line: declPos.line + 1,
        character: declPos.character,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
