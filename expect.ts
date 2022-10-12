import type { Operation } from "./types.ts";
import { action, suspend } from "./instructions.ts";

export function expect<T>(promise: Promise<T>): Operation<T> {
  return action(function* (resolve, reject) {
    promise.then(resolve, reject);
    yield* suspend();
  });
}
