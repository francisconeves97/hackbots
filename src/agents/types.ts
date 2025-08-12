export type AgentResult<T> =
  | {
      success: false;
      error: string;
    }
  | {
      success: true;
      data: T;
    };
