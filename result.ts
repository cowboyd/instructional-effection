export type Result<T = unknown> = { type: "resolved"; value: T } | {
  type: "rejected";
  error: Error;
};

export type Resolve<T = unknown> = (value: T) => void;
export type Reject = (error: Error) => void;

export type Outcome<T = unknown> = Result<T> | { type: 'terminated', result: Result<void> };

export function forward<T>(result: Result<T>, resolve: Resolve<T>, reject: Reject): void {
  if (result.type === 'resolved') {
    resolve(result.value);
  } else {
    reject(result.error);
  }
}
