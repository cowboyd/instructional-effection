import type { Continuation, Operation, Provide } from "./types.ts";

export function* suspend(): Operation<void> {
  return yield { type: "suspend" };
}

export function* resource<T>(
  operation: (provide: Provide<T>) => Operation<void>,
): Operation<T> {
  return yield { type: "resource", operation };
}

export function* action<T>(
  operation: (
    resolve: Continuation<T>,
    reject: Continuation<Error>,
  ) => Operation<void>,
): Operation<T> {
  return yield { type: "action", operation };
}
