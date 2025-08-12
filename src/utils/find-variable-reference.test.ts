import { describe, expect, it } from "bun:test";
import { join } from "path";
import { findVariableReferenceByName } from "./find-variable-reference";

describe("findVariableReferenceByName", () => {
  const variableTestPath = join(import.meta.dir, "test", "variable-test.ts");

  describe("working variable references by name", () => {
    it("should find listener variable and return content", () => {
      const result = findVariableReferenceByName(
        variableTestPath,
        {
          startPosition: { line: 17, column: 0 },
          endPosition: { line: 17, column: 38 },
        },
        "listener",
        5
      );

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.file).toBe(variableTestPath);
        expect(result.data.content).toContain("const listener");
        expect(result.data.startPosition.line).toBe(1);
        expect(result.data.startPosition.column).toBe(0);
        expect(result.data.endPosition.line).toBe(5);
        expect(result.data.endPosition.column).toBeGreaterThan(0);
      }
    });

    it("should handle linesToRead exceeding maximum", () => {
      const result = findVariableReferenceByName(
        variableTestPath,
        {
          startPosition: { line: 17, column: 0 },
          endPosition: { line: 17, column: 38 },
        },
        "listener",
        2500
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("exceeds maximum allowed");
    });

    it("should handle variable not found in range", () => {
      const result = findVariableReferenceByName(
        variableTestPath,
        {
          startPosition: { line: 17, column: 1 },
          endPosition: { line: 17, column: 30 },
        },
        "nonexistentVariable",
        5
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Variable 'nonexistentVariable' not found in the specified range"
      );
    });

    it("should handle non-existent file", () => {
      const result = findVariableReferenceByName(
        "non-existent-file.ts",
        {
          startPosition: { line: 1, column: 1 },
          endPosition: { line: 5, column: 30 },
        },
        "listener",
        5
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Source file not found");
    });
  });

  it("error cases", () => {
    const result = findVariableReferenceByName(
      variableTestPath,
      {
        startPosition: { line: 1, column: 1 },
        endPosition: { line: 1, column: 1 },
      },
      "asdijaisdj",
      5
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Variable 'asdijaisdj' not found in the specified range"
    );
  });

  // it("should find variable reference by name", () => {
  //   const result = findVariableReferenceByName(
  //     "/Users/francisconeves/jxscout/mercadolibre/optimized/http2.mlstatic.com/frontend-assets/mshops-web-myml-editor/913.50e9898d.js",
  //     {
  //       startPosition: { line: 4196, column: 237 },
  //       endPosition: { line: 4196, column: 276 },
  //     },
  //     "C",
  //     20
  //   );

  //   expect(result.success).toBe(true);
  // });

  // it("should find variable reference by name", () => {
  //   const result = findVariableReferenceByName(
  //     "/Users/francisconeves/jxscout/mercadolibre/original/http2.mlstatic.com/frontend-assets/mshops-web-myml-editor/index.ca7a103a.js",
  //     {
  //       startPosition: { line: 46666, column: 466 },
  //       endPosition: { line: 46666, column: 21 },
  //     },
  //     "ue",
  //     20
  //   );

  //   expect(result.success).toBe(true);
  // });
});
