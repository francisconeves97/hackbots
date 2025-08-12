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
    debug: (message: string, ...args: any[]) => {
      if (shouldLog("debug")) {
        console.log(`[DEBUG] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: any[]) => {
      if (shouldLog("info")) {
        console.log(`[INFO] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: any[]) => {
      if (shouldLog("warn")) {
        console.warn(`[WARN] ${message}`, ...args);
      }
    },
    error: (message: string, ...args: any[]) => {
      if (shouldLog("error")) {
        console.error(`[ERROR] ${message}`, ...args);
      }
    },
  };
};
