import { APICallError, stepCountIs, streamText } from "ai";
import { z } from "zod";
import { getOnMessageListeners } from "../services/get-onmessage-listeners";
import type { DescriptorWithCodeLocation } from "../services/types";
import { findVariableReferenceByNameTool } from "../tools/find-variable-reference";
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
): Promise<AgentResult<AgentFinding>> => {
  const { textStream, finishReason: finishReasonPromise } = await streamText({
    model: context.model,
    prompt: `
            You're an expert security researcher specialized in analyzing client side JavaScript code.
          
            Your task is to review onmessage listeners for potential XSS vulnerabilities or interesting gadgets.
    
            You are given a code location on a file and you have access to tools to read file contents, find variable references and grep for patterns.
            You should use that to understand the logic of the onmessage listener. Finding variable references should be preferred as it's more precise.
    
            You SHOULD use the tools to understand the logic of the onmessage listener if you don't have that context.
            IMPORTANT: Prefer to use the findVariableReferenceByNameTool instead of the grepFileTool, as it's more precise. only use grepFileTool as a fallback.
    
            Interesting onmessage listeners have the following characteristics:
            - They are NOT part of a generic polifyll or framework
            - They are not sent through a generic MessageChannel port 
            - They have no origin check or have an origin check that could be bypassed by a cross domain (e.g. using a regex)
            - If there's a function call right at the beginning of the onmessage listener, it's probably a origin check and you should investigate that function.
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

              IMPORTANT: You shouldn't add any markdown formatting to the output, ALWAYS output only a valid JSON object.
            </output>
            `,
    tools: {
      readFileTool,
      grepFileTool,
      findVariableReferenceByNameTool,
    },
    experimental_telemetry: {
      isEnabled: context.telemetryEnabled,
      metadata: {
        sessionId: context.sessionID,
      },
    },

    stopWhen: stepCountIs(context.agentContext.maxIterations),
  });

  let text = "";
  for await (const chunk of textStream) {
    text += chunk;
    process.stdout.write(chunk);
  }

  const finishReason = await finishReasonPromise;

  if (text === "") {
    if (finishReason) {
      return {
        success: false,
        error: "Agent stopped because it reached the max number of iterations",
      };
    }

    if (finishReason === "error") {
      return {
        success: false,
        error: "Agent stopped because it errored",
      };
    }
  }
  const finding = JSON.parse(text);

  return {
    success: true,
    data: agentFindingSchema.parse(finding),
  };
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
    if (
      descriptor.filePath.includes("/optimized/") ||
      descriptor.filePath.includes("sourcemaps/reversed")
    ) {
      // TODO: add a more robust way of deduplication.
      // also sourcemaps have lots of potential where we could include all sources
      // but that would need more work
      continue;
    }

    try {
      context.logger.info(
        `Agent analyzing onmessage listener on ${descriptor.value}. Filepath: ${descriptor.filePath}`
      );

      const findingResponse = await onMessageAgentWorker(context, descriptor);

      if (!findingResponse.success) {
        context.logger.error(
          `Error on onMessageAgentWorker: ${findingResponse.error}`
        );
        continue;
      }

      if (findingResponse.data.severity !== "none") {
        findings.push({ descriptor, finding: findingResponse.data });
        context.logger.info(
          `[FINDING!!!] Agent marked finding on ${descriptor.value} as ${findingResponse.data.severity}: ${findingResponse.data.reason}. Filepath: ${descriptor.filePath}`
        );
      } else {
        context.logger.info(
          `Agent marked finding on ${descriptor.value} as ${findingResponse.data.severity}: ${findingResponse.data.reason}`
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
