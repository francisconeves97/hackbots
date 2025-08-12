import { APICallError, stepCountIs, streamText } from "ai";
import { z } from "zod";
import { getJSFiles } from "../services/get-js-files";
import { getOnMessageListeners } from "../services/get-onmessage-listeners";
import { getRoutes } from "../services/get-routes";
import type { DescriptorWithCodeLocation } from "../services/types";
import { findVariableReferenceByNameTool } from "../tools/find-variable-reference";
import { grepFileTool } from "../tools/grep-file";
import { readFileTool } from "../tools/read-file";
import type { AgentContext } from "../types";
import type { AgentResult } from "./types";

export type OnMessageAgentContext = {
  maxIterations: number;
  htmlRouteFilePaths: string[];
  checkSourcemaps: boolean;
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
  context.logger.info("Starting onmessage listener analysis", {
    agent: "onmessage",
    filePath: descriptor.filePath,
    descriptor: descriptor.value,
    line: descriptor.startPosition.line,
    column: descriptor.startPosition.column,
  });

  const { textStream, fullStream } = await streamText({
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
  let iterationCount = 0;

  for await (const chunk of textStream) {
    text += chunk;
    iterationCount++;

    if (iterationCount % 5 === 0) {
      context.logger.debug("Agent iteration progress", {
        agent: "onmessage",
        filePath: descriptor.filePath,
        descriptor: descriptor.value,
        iteration: iterationCount,
        maxIterations: context.agentContext.maxIterations,
      });
    }
  }

  const finishReason = await finishReasonPromise;

  if (text === "") {
    if (finishReason) {
      context.logger.warn("Agent stopped due to max iterations reached", {
        agent: "onmessage",
        filePath: descriptor.filePath,
        descriptor: descriptor.value,
        maxIterations: context.agentContext.maxIterations,
      });
      return {
        success: false,
        error: "Agent stopped because it reached the max number of iterations",
      };
    }

    if (finishReason === "error") {
      context.logger.error("Agent stopped due to error", {
        agent: "onmessage",
        filePath: descriptor.filePath,
        descriptor: descriptor.value,
      });
      return {
        success: false,
        error: "Agent stopped because it errored",
      };
    }
  }

  try {
    const finding = JSON.parse(text);
    const parsedFinding = agentFindingSchema.parse(finding);

    context.logger.info("Analysis completed successfully", {
      agent: "onmessage",
      filePath: descriptor.filePath,
      descriptor: descriptor.value,
      severity: parsedFinding.severity,
      iterations: iterationCount,
    });

    return {
      success: true,
      data: parsedFinding,
    };
  } catch (error) {
    context.logger.error("Failed to parse agent response", {
      agent: "onmessage",
      filePath: descriptor.filePath,
      descriptor: descriptor.value,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "Failed to parse agent response",
    };
  }
};

const onMessageAgentCheckFile = async (
  context: AgentContext<OnMessageAgentContext>,
  jsFile: string
): Promise<AgentResult<undefined>> => {
  context.logger.subsection("Analyzing JavaScript file", {
    agent: "onmessage",
    jsFile,
  });

  const messageListenersResponse = await getOnMessageListeners(jsFile);

  if (!messageListenersResponse.success) {
    context.logger.error("Failed to get onmessage listeners", {
      agent: "onmessage",
      jsFile,
      error: messageListenersResponse.error,
    });
    return { success: false, error: messageListenersResponse.error };
  }

  const listeners = messageListenersResponse.data;
  context.logger.info(`Found ${listeners.length} onmessage listeners`, {
    agent: "onmessage",
    jsFile,
    listenerCount: listeners.length,
  });

  const findings: OnMessageFinding[] = [];
  let processedCount = 0;
  let skippedCount = 0;

  for (const descriptor of listeners) {
    if (
      descriptor.filePath.includes("/optimized/") ||
      descriptor.filePath.includes("sourcemaps/reversed")
    ) {
      context.logger.debug("Skipping optimized/sourcemap file", {
        agent: "onmessage",
        filePath: descriptor.filePath,
        descriptor: descriptor.value,
      });
      skippedCount++;
      continue;
    }

    try {
      context.logger.info("Analyzing onmessage listener", {
        agent: "onmessage",
        filePath: descriptor.filePath,
        descriptor: descriptor.value,
        line: descriptor.startPosition.line,
        column: descriptor.startPosition.column,
      });

      const findingResponse = await onMessageAgentWorker(context, descriptor);

      if (!findingResponse.success) {
        context.logger.error("Agent worker failed", {
          agent: "onmessage",
          filePath: descriptor.filePath,
          descriptor: descriptor.value,
          error: findingResponse.error,
        });
        continue;
      }

      if (findingResponse.data.severity !== "none") {
        findings.push({ descriptor, finding: findingResponse.data });
        context.logger.finding(
          findingResponse.data.severity as "low" | "medium" | "high",
          findingResponse.data.reason,
          {
            agent: "onmessage",
            filePath: descriptor.filePath,
            descriptor: descriptor.value,
            line: descriptor.startPosition.line,
            column: descriptor.startPosition.column,
          }
        );
      } else {
        context.logger.info("No security issues found", {
          agent: "onmessage",
          filePath: descriptor.filePath,
          descriptor: descriptor.value,
          severity: findingResponse.data.severity,
        });
      }

      processedCount++;
      context.logger.progress(
        processedCount,
        listeners.length,
        "Processing listeners",
        {
          agent: "onmessage",
          jsFile,
        }
      );
    } catch (error) {
      if (APICallError.isInstance(error)) {
        context.logger.error("API call error in agent worker", {
          agent: "onmessage",
          filePath: descriptor.filePath,
          descriptor: descriptor.value,
          statusCode: error.statusCode,
          error: error.message,
        });
      } else {
        context.logger.error("Unexpected error in agent worker", {
          agent: "onmessage",
          filePath: descriptor.filePath,
          descriptor: descriptor.value,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  context.logger.success("File analysis completed", {
    agent: "onmessage",
    jsFile,
    processed: processedCount,
    skipped: skippedCount,
    findings: findings.length,
  });

  return { success: true, data: undefined };
};

const onMessageAgent = async (
  context: AgentContext<OnMessageAgentContext>
): Promise<AgentResult<undefined>> => {
  context.logger.section("OnMessage Agent Analysis", {
    agent: "onmessage",
    maxIterations: context.agentContext.maxIterations,
    checkSourcemaps: context.agentContext.checkSourcemaps,
  });

  let routesToCheck: string[] = [];

  if (context.agentContext.htmlRouteFilePaths.length > 0) {
    routesToCheck = context.agentContext.htmlRouteFilePaths;
    context.logger.info("Using provided HTML route file paths", {
      agent: "onmessage",
      routeCount: routesToCheck.length,
    });
  } else {
    context.logger.info("Discovering routes automatically");
    const getRoutesResponse = await getRoutes();
    if (!getRoutesResponse.success) {
      context.logger.error("Failed to get routes", {
        agent: "onmessage",
        error: getRoutesResponse.error,
      });
      return { success: false, error: getRoutesResponse.error };
    }
    routesToCheck = getRoutesResponse.data;
    context.logger.info("Routes discovered", {
      agent: "onmessage",
      routeCount: routesToCheck.length,
    });
  }

  let totalFilesProcessed = 0;
  let totalFilesFailed = 0;
  let totalFindings = 0;

  for (let routeIndex = 0; routeIndex < routesToCheck.length; routeIndex++) {
    const route = routesToCheck[routeIndex];

    context.logger.subsection(
      `Processing route ${routeIndex + 1}/${routesToCheck.length}`,
      {
        agent: "onmessage",
        route,
        routeIndex: routeIndex + 1,
        totalRoutes: routesToCheck.length,
      }
    );

    const jsFilesToCheckResponse = await getJSFiles({
      htmlRouteFilePath: route!,
      excludeOriginalJSFiles: context.agentContext.checkSourcemaps,
      includeReversedSources: context.agentContext.checkSourcemaps,
    });

    if (!jsFilesToCheckResponse.success) {
      context.logger.error("Failed to get JS files for route", {
        agent: "onmessage",
        route,
        error: jsFilesToCheckResponse.error,
      });
      totalFilesFailed++;
      continue;
    }

    const jsFiles = jsFilesToCheckResponse.data;
    context.logger.info(`Found ${jsFiles.length} JavaScript files for route`, {
      agent: "onmessage",
      route,
      jsFileCount: jsFiles.length,
    });

    for (let fileIndex = 0; fileIndex < jsFiles.length; fileIndex++) {
      const jsFile = jsFiles[fileIndex];

      try {
        context.logger.progress(
          fileIndex + 1,
          jsFiles.length,
          `Processing file ${fileIndex + 1}/${jsFiles.length}`,
          {
            agent: "onmessage",
            route,
            jsFile,
          }
        );

        await onMessageAgentCheckFile(context, jsFile!);
        totalFilesProcessed++;
      } catch (error) {
        context.logger.error("Failed to check file", {
          agent: "onmessage",
          route,
          jsFile,
          error: error instanceof Error ? error.message : String(error),
        });
        totalFilesFailed++;
      }
    }
  }

  context.logger.section("Analysis Summary", {
    agent: "onmessage",
  });

  context.logger.success("OnMessage agent analysis completed", {
    agent: "onmessage",
    routesProcessed: routesToCheck.length,
    filesProcessed: totalFilesProcessed,
    filesFailed: totalFilesFailed,
    totalFiles: totalFilesProcessed + totalFilesFailed,
  });

  return { success: true, data: undefined };
};

export { onMessageAgent };
