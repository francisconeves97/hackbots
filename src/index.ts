import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseExporter } from "langfuse-vercel";
import { parseArgs } from "util";
import {
  onMessageAgent,
  type OnMessageAgentContext,
} from "./agents/onmessage-agent";
import { getModel } from "./providers";
import type { AgentContext } from "./types";
import { logger, type LogLevel } from "./utils/logger";

const telemetryMiddleware = async (
  telemetryEnabled: boolean,
  func: () => Promise<any>
) => {
  if (!telemetryEnabled) {
    return func();
  }

  const baseUrl = Bun.env.LANGFUSE_BASE_URL;
  const publicKey = Bun.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = Bun.env.LANGFUSE_SECRET_KEY;

  const sdk = new NodeSDK({
    traceExporter: new LangfuseExporter({
      baseUrl,
      publicKey,
      secretKey,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();

  await func();

  await sdk.shutdown();
};

type CLIArgs = {
  filePath: string;
  enableTelemetry: boolean;
  provider: string;
  model: string;
  agent: string;
  logLevel: LogLevel;
};

const parseAndValidateCLIArgs = (): CLIArgs => {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      "file-path": {
        type: "string",
      },
      "enable-telemetry": {
        type: "boolean",
        default: false,
      },
      provider: {
        type: "string",
        default: "lmstudio",
      },
      model: {
        type: "string",
        default: "openai/gpt-oss-20b",
      },
      agent: {
        type: "string",
      },
      "log-level": {
        type: "string",
        default: "info",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  if (!values["file-path"]) {
    throw new Error("Missing required argument: --file-path");
  }

  if (
    !["none", "debug", "info", "warn", "error"].includes(values["log-level"])
  ) {
    throw new Error(
      "Invalid log level. Must be one of: none, debug, info, warn, error"
    );
  }

  return {
    filePath: values["file-path"],
    enableTelemetry: values["enable-telemetry"],
    provider: values["provider"],
    model: values["model"],
    agent: values["agent"] || "",
    logLevel: values["log-level"] as LogLevel,
  };
};

const main = async () => {
  const args = parseAndValidateCLIArgs();

  await telemetryMiddleware(args.enableTelemetry, async () => {
    const model = getModel(args.provider, args.model);

    const context: AgentContext = {
      telemetryEnabled: args.enableTelemetry,
      model,
      logger: logger(args.logLevel),
      agentContext: undefined,
    };

    switch (args.agent) {
      case "onmessage":
        const onMessageAgentContext: AgentContext<OnMessageAgentContext> = {
          ...context,
          agentContext: {
            filePath: args.filePath,
            maxIterations: parseInt(
              Bun.env.ONMESSAGE_AGENT_MAX_ITERATIONS || "10"
            ),
          },
        };
        const result = await onMessageAgent(onMessageAgentContext);

        if (!result.success) {
          throw new Error(result.error);
        }

        console.log(result.data);
        break;
      default:
        throw new Error(`Unknown agent: ${args.agent}`);
    }
  });
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
