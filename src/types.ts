export type Position = {
  line: number;
  column: number;
};

export type GrepMatch = {
  filePath: string;
  lineNumber: number;
  line: string;
  column?: number;
};
