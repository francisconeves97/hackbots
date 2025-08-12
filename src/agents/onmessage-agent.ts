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
You are an expert security researcher specialized in analyzing client-side JavaScript code for XSS vulnerabilities and security gadgets.

## TASK
Review the provided onmessage listener for potential XSS vulnerabilities or interesting security gadgets.

## TOOL USAGE STRATEGY
You have access to three tools. Use them in this specific order:

1. **findVariableReferenceByNameTool** (PREFERRED) - Use this FIRST to find variable definitions and references. This is more precise and efficient.
2. **readFileTool** - Use to read specific file contents when you need to see the full context.
3. **grepFileTool** (FALLBACK ONLY) - Only use this if findVariableReferenceByNameTool doesn't find what you need.

## ANALYSIS APPROACH
1. Start by using findVariableReferenceByNameTool to trace any variables, functions, or objects mentioned in the onmessage listener
2. Read relevant file sections to understand the data flow and logic
3. Look for security-relevant patterns in the code

## SECURITY INDICATORS
High-priority onmessage listeners typically have:
- No origin validation or weak origin checks (regex-based checks that can be bypassed)
- Direct use of message data without sanitization
- Data flowing to dangerous sinks (innerHTML, outerHTML, document.write, eval, etc.)
- Custom logic that processes untrusted input
- Function calls at the beginning (likely origin checks - investigate these)

Low-priority listeners (usually safe):
- Generic polyfills or framework code
- MessageChannel port usage
- Third party libraries that are not used in the codebase

## SEVERITY GUIDELINES
- **high**: Direct XSS vector, unsanitized data to dangerous sinks
- **medium**: Potential XSS with some mitigations, interesting gadget logic
- **low**: Weak origin check, minor security concern
- **none**: Properly secured, no security issues

## TARGET
Analyze this onmessage listener:
${JSON.stringify(descriptor, null, 2)}

## OUTPUT
Output ONLY a valid JSON object:
{
  "severity": "none" | "low" | "medium" | "high",
  "reason": "Concise explanation of the security finding"
}

Do not add any markdown formatting or additional text - only the JSON object.
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
