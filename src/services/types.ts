import type { Position } from "../types";

export type DescriptorWithCodeLocation = {
  descriptorType: string;
  value: string;
  startPosition: Position;
  endPosition: Position;
};

export type ServiceResult<T> =
  | {
      success: false;
      error: string;
    }
  | {
      success: true;
      data: T;
    };
