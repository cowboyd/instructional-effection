export type Result<T = unknown> = { type: "resolved"; value: T } | {
  type: "rejected";
  error: Error;
};
