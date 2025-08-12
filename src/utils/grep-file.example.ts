import { grepFile } from "./grep-file";

async function example() {
  // Search for "export" in the current directory
  const result = await grepFile({
    pattern: "export",
    path: "./src",
    include: "*.ts",
  });

  if (result.success) {
    console.log("Found matches:");
    result.data.slice(0, 5).forEach((match) => {
      console.log(
        `${match.filePath}:${match.lineNumber}:${
          match.column
        } - ${match.line.trim()}`
      );
    });
  } else {
    console.error("Search failed:", result.error.message);
  }

  // Search case-insensitive for "hello" in all files
  const helloResult = await grepFile({
    pattern: "hello",
    path: "./src",
    caseSensitive: false,
  });

  if (helloResult.success) {
    console.log(`\nFound ${helloResult.data.length} matches for "hello":`);
    helloResult.data.slice(0, 3).forEach((match) => {
      console.log(
        `${match.filePath}:${match.lineNumber} - ${match.line.trim()}`
      );
    });
  }

  // Search in a single file
  const singleFileResult = await grepFile({
    pattern: "export",
    path: "./src/utils/grep-file.ts",
  });

  if (singleFileResult.success) {
    console.log(
      `\nFound ${singleFileResult.data.length} matches in single file:`
    );
    singleFileResult.data.slice(0, 3).forEach((match) => {
      console.log(
        `${match.filePath}:${match.lineNumber}:${
          match.column
        } - ${match.line.trim()}`
      );
    });
  }

  // Test case sensitive search
  const caseSensitiveResult = await grepFile({
    pattern: "hello",
    path: "./src/utils/grep-file.example.ts",
    caseSensitive: true,
  });

  if (caseSensitiveResult.success) {
    console.log(
      `\nFound ${caseSensitiveResult.data.length} case-sensitive matches for "hello":`
    );
    caseSensitiveResult.data.slice(0, 3).forEach((match) => {
      console.log(
        `${match.filePath}:${match.lineNumber} - ${match.line.trim()}`
      );
    });
  }
}

example().catch(console.error);
