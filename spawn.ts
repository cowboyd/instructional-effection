import type { Operation, Task } from './types.ts';
import { run } from "./run.ts";
import { resource } from './instructions.ts';

export function spawn<T>(block: () => Operation<T>): Operation<Task<T>> {
  return resource(function*(provide) {
    let task = run(block);
    try {
      yield* provide(task);
    } finally {
      yield* task.halt();
    }
  });
}
