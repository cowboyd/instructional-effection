export type Result<T = unknown> = { type: "resolved"; value: T } | {
  type: "rejected";
  error: Error;
};

export type Resolve<T = unknown> = (value: T) => void;
export type Reject = (error: Error) => void;
