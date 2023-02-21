import type { Block, Frame, Resolve, Result, Task } from "../types.ts";

import { futurize } from "../future.ts";
import { evaluate, shift } from "../deps.ts";

import { createObservable } from "./observer.ts";
import { createBlock } from "./block.ts";
import { create } from "./create.ts";

export function createFrameTask<T>(frame: Frame, block: Block<T>): Task<T> {
  let future = futurize(function* () {
    let result = yield* block;
    let teardown = yield* frame.destroy();
    if (teardown.type === "rejected") {
      return teardown;
    } else {
      return result.exit.result;
    }
  });
  return {
    ...future,
    halt: () =>
      futurize(function* () {
        let killblock = yield* block.abort();
        let killframe = yield* frame.destroy();
        if (killframe.type === "rejected") {
          return killframe;
        } else {
          return killblock;
        }
      }),
  };
}

let ids = 0;
export function createFrame(parent?: Frame): Frame {
  let result: Result<void>;
  let children = new Set<Frame>();
  let running = new Set<Block>();
  let context = Object.create(parent?.context ?? {});
  let observable = createObservable<Result<void>>();

  let teardown = evaluate<Resolve<Result<void>>>(function* () {
    let current = yield* shift<Result<void>>(function* (k) {
      return k;
    });

    for (let block of running) {
      let teardown = yield* block.abort();
      if (teardown.type !== "resolved") {
        current = teardown;
      }
    }

    while (children.size !== 0) {
      for (let child of [...children].reverse()) {
        let teardown = yield* child.destroy();
        if (teardown.type !== "resolved") {
          current = teardown;
        }
      }
    }

    observable.notify(result = current);
  });

  function* close($result: Result<void>) {
    if (result) {
      return result;
    }

    teardown($result);

    return yield* frame;
  }

  let frame: Frame = create<Frame>("Frame", {
    id: ids++,
    context,
  }, {
    createChild() {
      let child = createFrame();
      children.add(child);
      evaluate(function* () {
        yield* child;
        children.delete(child);
      });
      return child;
    },
    run(operation) {
      let block = createBlock(frame, operation);
      running.add(block);
      evaluate(function* () {
        yield* block;
        running.delete(block);
      });
      return block;
    },
    *crash(error: Error) {
      return yield* close({ type: "rejected", error });
    },
    *destroy() {
      return yield* close({ type: "resolved", value: void 0 });
    },
    *[Symbol.iterator]() {
      if (result) {
        return result;
      } else {
        let observer = observable.observe();
        let r = yield* observer;
        observer.drop();
        return r;
      }
    },
  });

  return frame;
}
