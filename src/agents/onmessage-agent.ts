import { APICallError, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getOnMessageListeners } from "../services/get-onmessage-listeners";
import type { DescriptorWithCodeLocation } from "../services/types";
import { grepFileTool } from "../tools/grep-file";
import { readFileTool } from "../tools/read-file";
import type { AgentContext } from "../types";
import type { AgentResult } from "./types";

export type OnMessageAgentContext = {
  maxIterations: number;
  filePath: string;
};

const agentFindingSchema = z.object({
  severity: z
    .enum(["none", "low", "medium", "high"])
    .describe("The severity of the finding"),
  reason: z.string().describe("Explanation why the finding is relevant"),
});

type AgentFinding = z.infer<typeof agentFindingSchema>;

type OnMessageFinding = {
  descriptor: DescriptorWithCodeLocation;
  finding: AgentFinding;
};

const onMessageAgentWorker = async (
  context: AgentContext<OnMessageAgentContext>,
  descriptor: DescriptorWithCodeLocation
) => {
  const { text } = await generateText({
    model: context.model,
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
    
            <output>
              You should output a **only** a valid JSON object with the following schema:
              {
                "severity": "none" | "low" | "medium" | "high",
                "reason": "Explanation why the finding is relevant. Should be concise and straight to the point."
              }

              You shouldn't add any markdown formatting to the output.
            </output>
            `,
    tools: {
      readFileTool,
      grepFileTool,
    },
    experimental_telemetry: {
      isEnabled: context.telemetryEnabled,
    },
    stopWhen: stepCountIs(context.agentContext.maxIterations),
  });

  context.logger.debug(`Raw agent response: ${text}`);
  const finding = JSON.parse(text);

  return agentFindingSchema.parse(finding);
};

const onMessageAgent = async (
  context: AgentContext<OnMessageAgentContext>
): Promise<AgentResult<OnMessageFinding[]>> => {
  const messageListenersResponse = await getOnMessageListeners(
    context.agentContext.filePath
  );

  if (!messageListenersResponse.success) {
    return { success: false, error: messageListenersResponse.error };
  }

  const findings: OnMessageFinding[] = [];

  for (const descriptor of messageListenersResponse.data) {
    try {
      const findingResponse = await onMessageAgentWorker(context, descriptor);

      if (findingResponse.severity !== "none") {
        findings.push({ descriptor, finding: findingResponse });
      } else {
        context.logger.debug(
          `Agent marked finding on ${descriptor.value} as ${findingResponse.severity}: ${findingResponse.reason}`
        );
      }
    } catch (error) {
      if (APICallError.isInstance(error)) {
        context.logger.error(
          `Error on onMessageAgentWorker: ${error.statusCode} ${error.message}`
        );
      } else {
        context.logger.error(`Error on onMessageAgentWorker: ${error}`);
      }
    }
  }

  return { success: true, data: findings };
};

export { onMessageAgent };
