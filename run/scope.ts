import type { Operation, Scope } from "../types.ts";
import { createFrame } from "./frame.ts";
import { create } from "./create.ts";
import { futurize } from "../future.ts";
import { getframe } from "../instructions.ts";

export function* useScope(): Operation<Scope> {
  let frame = yield* getframe();
  return createScope(frame);
}

export function createScope(frame = createFrame()): Scope {
  return create<Scope>("Scope", {}, {
    run(operation) {
      let block = frame.run(operation);
      let future = futurize(function* () {
        let exhausted = yield* block;
        if (
          exhausted.exit.reason === "completed" &&
          exhausted.exit.result.type === "rejected"
        ) {
          let teardown = yield* frame.crash(exhausted.exit.result.error);
          if (teardown.type === "rejected") {
            return teardown;
          }
        }
        return exhausted.exit.result;
      });
      let task = create("Task", {}, {
        ...future,
        halt: () => futurize(() => block.abort()),
      });

      block.enter();

      return task;
    },
    close: () => futurize(() => frame.destroy()),
    [Symbol.iterator]: () => futurize(() => frame)[Symbol.iterator](),
  });
}
