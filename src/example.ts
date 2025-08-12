import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
});

const model = lmstudio("openai/gpt-oss-20b");

const { textStream, toolResults } = streamText({
  model,
  tools: {
    weather: tool({
      description: "Get the weather in a location",
      inputSchema: z.object({
        location: z.string().describe("The location to get the weather for"),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10,
      }),
    }),
  },
  prompt: "What is the weather in San Francisco?",
  stopWhen: stepCountIs(5),
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
