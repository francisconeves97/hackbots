import { describe, it, expect } from "bun:test";
import { readFile, FileError } from "./files";
import { join } from "path";

describe("readFile", () => {
  const testFilePath = join(import.meta.dir, "test", "example_file.txt");

  describe("full file reading", () => {
    it("should read entire file content successfully", async () => {
      const result = await readFile({ filePath: testFilePath });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain(
          "This is the first line of the example file."
        );
        expect(result.data).toContain(
          "This is the fifth and final line of the example file."
        );
        expect(result.data.split("\n")).toHaveLength(6);
      }
    });
  });

  describe("location-based reading", () => {
    it("should read a single line range", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 2, column: 1 },
          endPosition: { line: 2, column: 42 },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("This is the second line with some content.");
      }
    });

    it("should read a partial line range", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 3, column: 10 },
          endPosition: { line: 3, column: 25 },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("he third line th");
      }
    });

    it("should read across multiple lines", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 2, column: 20 },
          endPosition: { line: 4, column: 15 },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const lines = result.data.split("\n");
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe("line with some content.");
        expect(lines[1]).toBe(
          "This is the third line that contains more text."
        );
        expect(lines[2]).toBe("This is the fou");
      }
    });

    it("should read from start of one line to end of another", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 1, column: 1 },
          endPosition: { line: 2, column: 42 },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const lines = result.data.split("\n");
        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe("This is the first line of the example file.");
        expect(lines[1]).toBe("This is the second line with some content.");
      }
    });
  });

  describe("error cases", () => {
    it("should return FILE_NOT_FOUND for non-existent file", async () => {
      try {
        const result = await readFile({ filePath: "non-existent-file.txt" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(FileError.FILE_NOT_FOUND);
          expect(result.error.message).toContain("File not found");
        }
      } catch (error) {
        expect(error).toBeDefined();
        if (error instanceof Error) {
          expect(error.message).toContain("ENOENT");
        }
      }
    });

    it("should return IS_DIRECTORY for directory path", async () => {
      const result = await readFile({ filePath: import.meta.dir });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FileError.IS_DIRECTORY);
        expect(result.error.message).toContain("Path is a directory");
      }
    });

    it("should return INVALID_POSITION for out of bounds line", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 10, column: 1 },
          endPosition: { line: 10, column: 10 },
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FileError.INVALID_POSITION);
        expect(result.error.message).toContain("Position out of bounds");
      }
    });

    it("should return INVALID_POSITION for out of bounds column", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 1, column: 100 },
          endPosition: { line: 1, column: 110 },
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FileError.INVALID_POSITION);
        expect(result.error.message).toContain("Position out of bounds");
      }
    });

    it("should return INVALID_POSITION for invalid position order", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 3, column: 10 },
          endPosition: { line: 2, column: 5 },
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FileError.INVALID_POSITION);
        expect(result.error.message).toContain(
          "Start position must be before end position"
        );
      }
    });

    it("should return INVALID_POSITION for same line with invalid column order", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 2, column: 20 },
          endPosition: { line: 2, column: 10 },
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FileError.INVALID_POSITION);
        expect(result.error.message).toContain(
          "Start position must be before end position"
        );
      }
    });
  });

  describe("edge cases", () => {
    it("should handle single character selection", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 1, column: 5 },
          endPosition: { line: 1, column: 5 },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(" ");
      }
    });

    it("should handle selection from start to end of file", async () => {
      const result = await readFile({
        filePath: testFilePath,
        location: {
          startPosition: { line: 1, column: 1 },
          endPosition: { line: 5, column: 53 },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const lines = result.data.split("\n");
        expect(lines).toHaveLength(5);
      }
    });
  });
});
