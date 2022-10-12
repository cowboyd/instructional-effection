import type { Operation, Provide, Reject, Resolve } from "./types.ts";

export function suspend(): Operation<void> {
  return [{ type: "suspend" }];
}

export function* resource<T>(
  operation: (provide: Provide<T>) => Operation<void>,
): Operation<T> {
  return yield { type: "resource", operation };
}

export function* action<T>(
  operation: (
    resolve: Resolve<T>,
    reject: Reject,
  ) => Operation<void>,
): Operation<T> {
  return yield { type: "action", operation };
}
