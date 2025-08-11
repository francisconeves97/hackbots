import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, streamText } from "ai";
import { parseArgs } from "util";
import { getOnmessageListeners } from "./tools/get-onmessage-listeners";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    "file-path": {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

if (!values["file-path"]) {
  console.error("Missing required argument: --file-path");
  process.exit(1);
}

const filePath = values["file-path"];
console.log(filePath);

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
});

const model = lmstudio("openai/gpt-oss-20b");

const { textStream } = streamText({
  model,
  prompt: `
  You're an expert security researcher specialized in analyzing client side JavaScript code.

  Your task is to get static analysis results for the given file and call the get-onmessage-listeners tool to get the onmessage listeners.
  That tool will return you a list of onmessage listeners, together with their code location. 
  With those locations, your goal is to understand which onmessage listeners are relevant for the application,
  and which are not (e.g. because they are part of a framework or a library and don't contain interesting logic).

  You will then pass the relevant onmessage listeners to another agent which will check if the onmessage listeners
  could be vulnerable to XSS attacks.

  The file to analyze is: ${filePath}
  `,
  tools: {
    getOnmessageListeners,
  },
  stopWhen: stepCountIs(5),
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
