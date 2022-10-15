import type { Operation, Task } from "./types.ts";

export function* spawn<T>(block: () => Operation<T>): Operation<Task<T>> {
  return yield { type: "spawn", operation: block };
}
