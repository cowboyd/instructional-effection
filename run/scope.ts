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
        let result = yield* block;
        if (result.type === "rejected") {
          let teardown = yield* frame.crash(result.error);
          if (teardown.type === "rejected") {
            return teardown;
          } else {
            return result;
          }
        } else if (result.type === "aborted") {
          if (result.result.type === "rejected") {
            return result.result;
          } else {
            return { type: "rejected", error: new Error("halted") };
          }
        }
        return result;
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
