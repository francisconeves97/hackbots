import chalk from "chalk";

export type LogLevel = "none" | "debug" | "info" | "warn" | "error";

const getLogLevelPriority = (level: LogLevel): number => {
  switch (level) {
    case "none":
      return 4;
    case "debug":
      return 0;
    case "info":
      return 1;
    case "warn":
      return 2;
    case "error":
      return 3;
    default:
      return 0;
  }
};

export type Logger = ReturnType<typeof logger>;

export const logger = (level: LogLevel) => {
  const currentLevelPriority = getLogLevelPriority(level);

  const shouldLog = (messageLevel: LogLevel): boolean => {
    return getLogLevelPriority(messageLevel) >= currentLevelPriority;
  };

  return {
    stdoutDebug: (message: string) => {
      if (shouldLog("debug")) {
        process.stdout.write(message);
      }
    },
    debug: (message: string, ...args: any[]) => {
      if (shouldLog("debug")) {
        console.log(chalk.gray(message), ...args);
      }
    },
    info: (message: string, ...args: any[]) => {
      if (shouldLog("info")) {
        console.log(chalk.blue(message), ...args);
      }
    },
    warn: (message: string, ...args: any[]) => {
      if (shouldLog("warn")) {
        console.warn(chalk.yellow(message), ...args);
      }
    },
    error: (message: string, ...args: any[]) => {
      if (shouldLog("error")) {
        console.error(chalk.red(message), ...args);
      }
    },
  };
};
