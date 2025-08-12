import type { LanguageModel } from "ai";
import type { Logger } from "./utils/logger";

export type Position = {
  /** 1 indexed line number */
  line: number;
  /** 0 indexed column number */
  column: number;
};

export type GrepMatch = {
  filePath: string;
  lineNumber: number;
  line: string;
  column?: number;
};

export type AgentContext<AgentSpecificContext = undefined> = {
  telemetryEnabled: boolean;
  sessionID: string;
  model: LanguageModel;
  logger: Logger;
  agentContext: AgentSpecificContext;
};
