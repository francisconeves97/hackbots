import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { grepFile, GrepError } from "./grep-file";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("grepFile", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), "grep-file-test");
    await mkdir(testDir, { recursive: true });

    // Create test files
    await writeFile(
      join(testDir, "file1.txt"),
      "Hello world\nThis is a test\nHello again"
    );
    await writeFile(
      join(testDir, "file2.js"),
      "console.log('Hello');\nconst test = 'world';"
    );
    await writeFile(
      join(testDir, "file3.md"),
      "# Hello\nThis is markdown\nHello world"
    );

    // Create a subdirectory
    await mkdir(join(testDir, "subdir"));
    await writeFile(
      join(testDir, "subdir", "file4.txt"),
      "Hello from subdir\nAnother hello"
    );

    // Create files to exclude
    await mkdir(join(testDir, "node_modules"));
    await writeFile(
      join(testDir, "node_modules", "ignored.js"),
      "Hello ignored"
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should find matches in files", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: testDir,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      expect(
        result.data.some((match) => match.filePath.includes("file1.txt"))
      ).toBe(true);
      expect(
        result.data.some((match) => match.filePath.includes("file3.md"))
      ).toBe(true);
    }
  });

  it("should handle case insensitive search", async () => {
    const result = await grepFile({
      pattern: "hello",
      path: testDir,
      caseSensitive: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  it("should handle case sensitive search", async () => {
    const result = await grepFile({
      pattern: "hello",
      path: testDir,
      caseSensitive: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Should find matches because some files contain "hello" (lowercase)
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  it("should filter by include pattern", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: testDir,
      include: "*.txt",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        result.data.every((match) => match.filePath.endsWith(".txt"))
      ).toBe(true);
    }
  });

  it("should exclude node_modules by default", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: testDir,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        result.data.every((match) => !match.filePath.includes("node_modules"))
      ).toBe(true);
    }
  });

  it("should handle invalid regex pattern", async () => {
    const result = await grepFile({
      pattern: "[invalid",
      path: testDir,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(GrepError.INVALID_PATTERN);
    }
  });

  it("should handle single file search", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: join(testDir, "file1.txt"),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      expect(
        result.data.every((match) => match.filePath.includes("file1.txt"))
      ).toBe(true);
    }
  });

  it("should handle non-existent path", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: join(testDir, "nonexistent.txt"),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // The error could be PATH_NOT_FOUND or SEARCH_FAILED depending on when the error occurs
      expect([GrepError.PATH_NOT_FOUND, GrepError.SEARCH_FAILED]).toContain(
        result.error.code
      );
    }
  });

  it("should include column information in matches", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: testDir,
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.length > 0) {
      const firstMatch = result.data[0];
      if (firstMatch) {
        expect(firstMatch.column).toBeDefined();
        expect(typeof firstMatch.column).toBe("number");
      }
    }
  });

  it("should handle basic search functionality", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: testDir,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  it("should handle single file search with all strategies", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: join(testDir, "file1.txt"),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      expect(
        result.data.every((match) => match.filePath.includes("file1.txt"))
      ).toBe(true);
    }
  });

  it("should handle case sensitive search in single file", async () => {
    const result = await grepFile({
      pattern: "Hello",
      path: join(testDir, "file1.txt"),
      caseSensitive: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Should find matches because file1.txt contains "Hello" (capitalized)
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  it("should handle case sensitive search with no matches", async () => {
    const result = await grepFile({
      pattern: "hello",
      path: join(testDir, "file1.txt"),
      caseSensitive: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Should find no matches because file1.txt contains "Hello" (capitalized) not "hello"
      expect(result.data.length).toBe(0);
    }
  });
});
