import type { Scope } from "../types.ts";
import { createFrame } from "./frame.ts";
import { create } from "./create.ts";
import { futurize } from "../future.ts";

export function createScope(): Scope {
  let frame = createFrame();
  return create<Scope>("Scope", {}, {
    run(operation) {
      let block = frame.run(operation);
      let future = futurize(function*() {
        let exhausted = yield* block;

        return exhausted.exit.result;
      });
      let task = create("Task", {}, {
        ...future,
        halt: () => futurize(() => block.abort())
      });

      block.enter();

      return task;
    },
    close: () => futurize(() => frame.destroy()),
    [Symbol.iterator]: () => futurize(() => frame)[Symbol.iterator]()
  });
}
