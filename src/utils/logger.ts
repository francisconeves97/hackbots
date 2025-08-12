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
    debug: (message: string) => {
      if (shouldLog("debug")) {
        console.log(`[DEBUG] ${message}`);
      }
    },
    info: (message: string) => {
      if (shouldLog("info")) {
        console.log(`[INFO] ${message}`);
      }
    },
    warn: (message: string) => {
      if (shouldLog("warn")) {
        console.warn(`[WARN] ${message}`);
      }
    },
    error: (message: string) => {
      if (shouldLog("error")) {
        console.error(`[ERROR] ${message}`);
      }
    },
  };
};
