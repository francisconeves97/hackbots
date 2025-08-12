import { APICallError, stepCountIs, streamText } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { getJSFiles } from "../services/get-js-files";
import { getOnMessageListeners } from "../services/get-onmessage-listeners";
import { getRoutes } from "../services/get-routes";
import type { DescriptorWithCodeLocation } from "../services/types";
import { findVariableReferenceByNameTool } from "../tools/find-variable-reference";
import { grepFileTool } from "../tools/grep-file";
import { readFileTool } from "../tools/read-file";
import type { AgentContext } from "../types";
import { formatFullStreamChunk } from "../utils/format-full-stream-chunk";
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
  const {
    textStream,
    finishReason: finishReasonPromise,
    fullStream,
  } = await streamText({
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

  for await (const chunk of fullStream) {
    context.logger.stdoutDebug(chalk.gray(formatFullStreamChunk(chunk)));
  }

  for await (const chunk of textStream) {
    text += chunk;
  }

  try {
    const finding = JSON.parse(text);
    const parsedFinding = agentFindingSchema.parse(finding);

    context.logger.debug("Analysis completed successfully", {
      agent: "onmessage",
      filePath: descriptor.filePath,
      descriptor: descriptor.value,
      severity: parsedFinding.severity,
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

  if (listeners.length > 0) {
    context.logger.info(
      chalk.blue(
        `  📄 Found ${listeners.length} onmessage listener${
          listeners.length > 1 ? "s" : ""
        } in ${chalk.bold(jsFile)}`
      )
    );
  } else {
    return { success: true, data: undefined };
  }

  const findings: OnMessageFinding[] = [];
  let processedCount = 0;
  let skippedCount = 0;

  for (const descriptor of listeners) {
    try {
      context.logger.info(chalk.gray("─".repeat(60)));

      context.logger.debug(
        `\nAnalyzing onmessage listener on ${descriptor.filePath}\n${descriptor.value}`
      );

      const findingResponse = await onMessageAgentWorker(context, descriptor);

      if (!findingResponse.success) {
        context.logger.error(
          `Agent worker failed to process ${descriptor.filePath}: ${findingResponse.error}`
        );
        continue;
      }

      if (findingResponse.data.severity !== "none") {
        findings.push({ descriptor, finding: findingResponse.data });

        // Display finding with appropriate styling
        const severityColors = {
          high: chalk.red,
          medium: chalk.yellow,
          low: chalk.blue,
        };

        const severityIcons = {
          high: "🚨",
          medium: "⚠️",
          low: "💡",
        };

        const color =
          severityColors[
            findingResponse.data.severity as keyof typeof severityColors
          ];
        const icon =
          severityIcons[
            findingResponse.data.severity as keyof typeof severityIcons
          ];

        context.logger.info(
          chalk.gray("    └─ ") +
            color(
              `${icon} ${findingResponse.data.severity.toUpperCase()}: ${
                findingResponse.data.reason
              }`
            )
        );
        context.logger.info(
          chalk.gray(
            `        📍 ${descriptor.filePath}:${descriptor.startPosition.line}:${descriptor.startPosition.column}`
          )
        );
      } else {
        context.logger.debug("No security issues found for this descriptor");
      }

      context.logger.info(chalk.gray("─".repeat(60)));

      processedCount++;
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

  if (findings.length > 0) {
    context.logger.info(
      chalk.green(
        `  ✅ File analysis completed with ${findings.length} finding${
          findings.length > 1 ? "s" : ""
        }`
      )
    );
  }

  return { success: true, data: undefined };
};

const onMessageAgent = async (
  context: AgentContext<OnMessageAgentContext>
): Promise<AgentResult<undefined>> => {
  context.logger.info(
    chalk.bold("🔍 Starting onmessage lead generator agent...\n")
  );

  let routesToCheck: string[] = [];

  if (context.agentContext.htmlRouteFilePaths.length > 0) {
    routesToCheck = context.agentContext.htmlRouteFilePaths;
    context.logger.info(
      `📋 Using ${routesToCheck.length} provided route${
        routesToCheck.length > 1 ? "s" : ""
      }`
    );
  } else {
    context.logger.info("🔍 Getting routes from jxscout...");
    const getRoutesResponse = await getRoutes();
    if (!getRoutesResponse.success) {
      context.logger.error(
        `❌ Failed to discover routes: ${getRoutesResponse.error}`
      );
      return { success: false, error: getRoutesResponse.error };
    }
    routesToCheck = getRoutesResponse.data;
    context.logger.info(
      `📋 Found ${routesToCheck.length} route${
        routesToCheck.length > 1 ? "s" : ""
      } to analyze`
    );
  }

  let totalFilesProcessed = 0;
  let totalFilesFailed = 0;

  context.logger.info("\n🚀 Starting analysis...\n");

  for (let routeIndex = 0; routeIndex < routesToCheck.length; routeIndex++) {
    const route = routesToCheck[routeIndex];

    context.logger.info(
      chalk.cyan(
        `📂 Processing route ${routeIndex + 1}/${
          routesToCheck.length
        }: ${chalk.bold(route)}`
      )
    );

    const jsFilesToCheckResponse = await getJSFiles({
      htmlRouteFilePath: route!,
      excludeOriginalJSFiles: context.agentContext.checkSourcemaps,
      includeReversedSources: context.agentContext.checkSourcemaps,
    });

    if (!jsFilesToCheckResponse.success) {
      context.logger.error(
        `  ❌ Failed to get JS files for route: ${jsFilesToCheckResponse.error}`
      );
      totalFilesFailed++;
      continue;
    }

    const jsFiles = jsFilesToCheckResponse.data;

    if (jsFiles.length > 0) {
      context.logger.info(
        `  📄 Found ${jsFiles.length} JavaScript file${
          jsFiles.length > 1 ? "s" : ""
        }`
      );
    } else {
      context.logger.info(chalk.gray(`  📄 No JavaScript files found`));
    }

    for (let fileIndex = 0; fileIndex < jsFiles.length; fileIndex++) {
      const jsFile = jsFiles[fileIndex];

      try {
        await onMessageAgentCheckFile(context, jsFile!);
        totalFilesProcessed++;
      } catch (error) {
        context.logger.error(
          `  ❌ Failed to check file ${jsFile}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        totalFilesFailed++;
      }
    }
  }

  context.logger.info(chalk.gray("\n" + "─".repeat(60)));
  context.logger.info(chalk.bold("📊 Analysis Summary"));
  context.logger.info(chalk.gray("─".repeat(60)));
  context.logger.info(`  📂 Routes processed: ${routesToCheck.length}`);
  context.logger.info(`  📄 Files processed: ${totalFilesProcessed}`);
  if (totalFilesFailed > 0) {
    context.logger.warn(`  ⚠️  Files failed: ${totalFilesFailed}`);
  }
  context.logger.info(
    chalk.green(`  ✅ Total files: ${totalFilesProcessed + totalFilesFailed}`)
  );
  context.logger.info(chalk.gray("─".repeat(60)));

  context.logger.info(
    chalk.bold.green("\n🎉 OnMessage agent analysis completed!\n")
  );

  return { success: true, data: undefined };
};

export { onMessageAgent };
