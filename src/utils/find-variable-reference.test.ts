import { describe, expect, it } from "bun:test";
import { join } from "path";
import { findVariableReferenceByName } from "./find-variable-reference";

describe("findVariableReferenceByName", () => {
  const variableTestPath = join(import.meta.dir, "test", "variable-test.ts");

  describe("working variable references by name", () => {
    it("should find event variable in full file range", () => {
      const result = findVariableReferenceByName(
        variableTestPath,
        {
          startPosition: { line: 5, column: 0 },
          endPosition: { line: 5, column: 38 },
        },
        "listener"
      );

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.file).toBe(variableTestPath);
        console.log(result.data);
        expect(result.data.line).toBe(1);
        expect(result.data.character).toBe(6);
      }
    });
  });
});
