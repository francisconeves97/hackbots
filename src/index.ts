import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText } from "ai";
import { parseArgs } from "util";
import { getOnMessageListeners } from "./services/get-onmessage-listeners";
import { readFileTool } from "./tools/read-file";
import { grepFileTool } from "./tools/grep-file";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { trace } from "console";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { LangfuseExporter } from "langfuse-vercel";

const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter({
    baseUrl: "http://localhost:3000",
    publicKey: "pk-lf-a67112a2-ea8c-48ac-8de2-3b5284e0b828",
    secretKey: "sk-lf-6dc31c5a-ade2-4a16-aaf0-01f1c17fcc19",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

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

const descriptors = await getOnMessageListeners(filePath);
if (!descriptors.success) {
  console.error(descriptors.error);
  process.exit(1);
}

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
});

const model = lmstudio("openai/gpt-oss-20b");

for (const descriptor of descriptors.data) {
  console.log("\nAnalyzing onmessage listener\n\n", descriptor);

  const { textStream } = streamText({
    model,
    prompt: `
        You're an expert security researcher specialized in analyzing client side JavaScript code.
      
        Your task is to review onmessage listeners for potential XSS vulnerabilities or interesting gadgets.

        You are given a code location on a file and you have access to tools to read file contents and grep for patterns.
        You should use that to understand the logic of the onmessage listener.

        You SHOULD use the tools to understand the logic of the onmessage listener if you don't have that context.

        Interesting onmessage listeners have the following characteristics:
        - They are NOT part of a generic polifyll or framework
        - They are bound to the window object and are not a channel port
        - They have no origin check or have an origin check that could be bypassed by a cross domain
        - They have interesting logic that could be used to exploit the application
        - If the passed data is not sanitized and is sent to a sink (e.g. window.location, or innerHTML) then they are SUPER interesting
      
        Analyze the following onmessage listener:
        ${JSON.stringify(descriptor, null, 2)}

        If it doesn't look interesting, simply give a very small explanation, no need to go into detail. You are part of a pipeline to detect security
        vulnerabilities, so you should be concise and to the point.
        `,
    tools: {
      readFileTool,
      grepFileTool,
    },
    experimental_telemetry: {
      isEnabled: true,
    },
    stopWhen: stepCountIs(5),
  });

  for await (const textPart of textStream) {
    process.stdout.write(textPart);
  }
}

await sdk.shutdown();
