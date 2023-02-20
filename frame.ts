import type { Block, Frame, Exhausted, Instruction, IterationEvent, Exited, Future, Operation, Task } from "./types.ts";
import type { Computation } from "./deps.ts";
import type { Result } from "./future.ts";

import { evaluate, shift } from "./deps.ts";
import { createFuture } from "./future.ts";
import { createObservable } from "./observer.ts";

export function run<T>(operation: () => Operation<T>): Task<T> {
  let frame = createFrame();
  let block = frame.run(operation);
  block.enter();
  return {
    ...futurize(function*() {
      let result = yield* block;
      let teardown = yield* frame.destroy();
      if (teardown.type === "rejected") {
        return teardown;
      } else {
        return result.exit.result;
      }
    }),
    halt: () => futurize(() => frame.destroy()),
  };
}

function createBlock<T>(frame: Frame, operation: () => Operation<T>): Block<T> {
  let observable = createObservable<IterationEvent<T>>();
  let controller = new AbortController();
  let enter = evaluate<() => void>(function*() {
    yield* shift<void>(function*(k) {
      return k;
    });

    let iterator = operation()[Symbol.iterator]();

    let exit = yield* shift<Exited<T>>(function*(k) {
      let { signal } = controller;
      signal.onabort = () => k({
        type: "exited",
        reason: "terminated",
        result: { type: "rejected", error: new Error('halted') },
      });

      k({
        type: "exited",
        reason: "completed",
        result: yield* reduce({
          frame,
          iterator,
          signal,
          start: $next(void 0),
        }),
      })
    });

    observable.notify(exit);

    let exhausted: Exhausted<T> = {
      type: "exhausted",
      exit,
      result: yield* (function*(): Computation<Result<void>> {
        if (exit.reason === 'completed') {
          return { type: "resolved", value: void 0 };
        } else {
          return yield* reduce<void>({
            frame,
            iterator: iterator as Iterator<Instruction, void>,
            start: $abort()
          });
        }
      })()
    }

    observable.notify(exhausted);
  });

  let block: Block<T> = {
    enter,
    *abort() {
      controller.abort();
      let exhausted = yield* block;
      return exhausted.result;
    },
    observe: observable.observe,

    toTask() {
      let future = futurize(function*() {
        let exhausted = yield* block;
        return exhausted.exit.result;
      });

      return {
        ...future,
        halt: () => futurize(() => block.abort())
      }
    },

    *[Symbol.iterator]() {
      let observer = block.observe();
      while (true) {
        let event = yield* observer;
        if (event.type === "exhausted") {
          return event;
        }
      }
    }
  };
  return block;
}

interface ReduceOptions<T> {
  frame: Frame;
  iterator: Iterator<Instruction, T>;
  signal?: AbortSignal;
  start(i: Iterator<Instruction, T>): IteratorResult<Instruction, T>;
}

function reduce<T>(options: ReduceOptions<T>): Computation<Result<T>> {
  let { frame, iterator, signal, start: getNext } = options;
  return shift<Result<T>>(function*(exit) {
    while (!signal || !signal.aborted) {
      let next: IteratorResult<Instruction, T>;
      try {
        next = getNext(iterator);
      } catch (error) {
        exit({ type: "rejected", error });
        break;
      }
      if (next.done) {
        exit({ type: "resolved", value: next.value });
        break;
      }
      let instruction = next.value;

      let result = yield* shift<Result<unknown>>(function*(k) {
        try {
          k(yield* instruction(frame));
        } catch (error) {
          k({ type: "rejected", error });
        }
      });
      if (result.type === "rejected") {
        getNext = $throw(result.error);
      } else {
        getNext = $next(result.value);
      }
    }
  });
}

let ids = 0;
export function createFrame(): Frame {
  let result: Result<void>;
  let children = new Set<Frame>();
  let running = new Set<Block>();
  let frame: Frame = {
    id: ids++,
    createChild() {
      let child = createFrame();
      children.add(child);
      evaluate(function*() {
        let observer = child.observe();
        while (true) {
          let event = yield* observer;
          if (event.type === "destroyed") {
            children.delete(child);
            break;
          }
        }
        observer.drop();
      })
      return child;
    },
    run(operation) {
      let block = createBlock(frame, operation);
      running.add(block);
      evaluate(function*() {
        yield* block;
        running.delete(block);
      })
      return block;
    },
    *crash(error: Error) {
      result = { type: "rejected", error };
      return yield* frame.destroy();
    },
    *destroy() {
      result = result ?? { type: "resolved", value: void 0 }
      frame.destroy = function*() {
        return result
      };

      for (let block of running) {
        let teardown = yield* block.abort();
        if (teardown.type !== "resolved") {
          result = teardown;
        }
      }

      return result;
    }
  }

  return frame;
}

export interface Scope {
  run<T>(operation: () => Operation<T>): Task<T>;
  close(): Future<void>;
}

export function createScope(): Scope {
  let frame = createFrame();

  return {
    run(operation) {
      let block = frame.run(operation);
      let future = futurize(function*() {
        let end = yield* block;
        return end.exit.result;
      });
      return {
        ...future,
        halt: () => futurize(() => block.abort()),
      };
    },
    close: () => futurize(() => frame.destroy()),
  }
}

function futurize<T>(computation: () => Computation<Result<T>>): Future<T> {
  let { future, resolve, reject } = createFuture<T>();
  evaluate(function*() {
    let result = yield* computation();
    if (result.type === "resolved") {
      resolve(result.value);
    } else {
      reject(result.error);
    }
  })
  return future;
}

// deno-lint-ignore no-explicit-any
const $next = <T>(value: any) => (i: Iterator<Instruction, T>) => i.next(value);

const $throw = <T>(error: Error) => (i: Iterator<Instruction, T>) => {
  if (i.throw) {
    return i.throw(error);
  } else {
    throw error;
  }
};

const $abort = <T>(value?: unknown) => (i: Iterator<Instruction, T>) => {
  if (i.return) {
    return i.return(value as unknown as T);
  } else {
    return { done: true, value } as IteratorResult<Instruction, T>;
  }
};
