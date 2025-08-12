import type { TextStreamPart, ToolSet } from "ai";

export const formatFullStreamChunk = <T extends ToolSet>(
  chunk: TextStreamPart<T>
) => {
  if (chunk.type === "start") {
    return `Starting analysis...\n\n`;
  }

  if (chunk.type === "start-step") {
    return `Starting step...\n\n`;
  }

  if (chunk.type === "finish-step") {
    return `Step completed\n\n`;
  }

  if (chunk.type === "reasoning-start") {
    return `Starting reasoning...\n\n`;
  }

  if (chunk.type === "reasoning-delta") {
    return chunk.text;
  }

  if (chunk.type === "reasoning-end") {
    return `\n\nReasoning completed\n\n`;
  }

  if (chunk.type === "tool-call") {
    return `\nCalling tool ${chunk.toolName} with input ${JSON.stringify(
      chunk.input,
      null,
      2
    )}\n`;
  }

  if (chunk.type === "tool-result") {
    return `\nTool ${chunk.toolName} result: ${JSON.stringify(
      chunk.output,
      null,
      2
    )}\n`;
  }

  if (chunk.type === "tool-error") {
    return `\nTool ${chunk.toolName} error: ${JSON.stringify(
      chunk.error,
      null,
      2
    )}\n`;
  }

  if (chunk.type === "error") {
    return `\nError: ${JSON.stringify(chunk.error, null, 2)}\n`;
  }

  if (chunk.type === "finish") {
    return `Analysis completed\n\n`;
  }

  if (chunk.type === "abort") {
    return `Analysis aborted\n\n`;
  }

  return "";
};
