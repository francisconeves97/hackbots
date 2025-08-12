import { Command, Option } from "@commander-js/extra-typings";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseExporter } from "langfuse-vercel";
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

type AgentCommandWrapperArgs = {
  enableTelemetry: boolean;
  provider: string;
  model: string;
  logLevel: LogLevel;
};

const agentCommandWrapper = async <T extends AgentCommandWrapperArgs>(
  options: T,
  func: (context: AgentContext) => Promise<any>
) => {
  const globalOptions = program.optsWithGlobals();
  const args = { ...globalOptions, ...options };

  await telemetryMiddleware(args.enableTelemetry, async () => {
    const model = getModel(args.provider, args.model);

    const context: AgentContext = {
      telemetryEnabled: args.enableTelemetry,
      sessionID: crypto.randomUUID(),
      model,
      logger: logger(args.logLevel),
      agentContext: undefined,
    };

    await func(context);
  });
};

const program = new Command();

const rootCommand = program
  .name("hackbots")
  .description("Experimental hackbots to be used with jxscout")
  .addOption(
    new Option("--log-level <level>", "Set the log level")
      .default("info")
      .choices(["none", "debug", "info", "warn", "error"])
  )
  .addOption(
    new Option(
      "--enable-telemetry",
      "Enable LangFuse telemetry for the agent"
    ).default(false)
  )
  .addOption(
    new Option("--provider <provider>", "Set the provider").default("ollama")
  )
  .addOption(
    new Option("--model <model>", "Set the model").default("gpt-oss:20b")
  );

const runAgentCommand = rootCommand
  .command("run-agent")
  .description("Run an agent");

const onmessageLeadGeneratorCommand = runAgentCommand
  .command("onmessage-lead-generator")
  .description("Looks for onmessage listeners and generates leads")
  .addOption(
    new Option(
      "--html-route-file-paths <path...>",
      "Check for onmessage listeners loaded by this HTML file"
    ).default([] as string[])
  )
  .addOption(
    new Option(
      "--max-iterations <number>",
      "Max iterations per onmessage handler"
    )
      .default(15)
      .argParser((value) => parseInt(value))
  )
  .addOption(
    new Option(
      "--check-sourcemaps",
      "Check sourcemap code instead of original code"
    ).default(false)
  )
  .action(async (options) => {
    const globalOptions = onmessageLeadGeneratorCommand.optsWithGlobals();

    agentCommandWrapper(globalOptions, async (context) => {
      const onMessageAgentContext: AgentContext<OnMessageAgentContext> = {
        ...context,
        agentContext: {
          maxIterations: options.maxIterations,
          htmlRouteFilePaths: options.htmlRouteFilePaths,
          checkSourcemaps: options.checkSourcemaps,
        },
      };
      const result = await onMessageAgent(onMessageAgentContext);

      if (!result.success) {
        throw new Error(result.error);
      }
    });
  });

program.parse(Bun.argv);
