import type { Block, Frame, Resolve, Exhausted, Instruction, IterationEvent, Exited, Future, Operation, Task } from "./types.ts";
import type { Computation } from "./deps.ts";
import type { Result } from "./future.ts";

import { evaluate, reset, shift } from "./deps.ts";
import { createFuture } from "./future.ts";
import { createObservable } from "./observer.ts";
import { lazy } from "./lazy.ts";

export function run<T>(operation: () => Operation<T>): Task<T> {
  let frame = createFrame();
  let block = frame.run(operation);
  let task = createFrameTask(frame, block);
  block.enter();
  return task;
}

export function createFrameTask<T>(frame: Frame, block: Block<T>): Task<T> {
  let future = futurize(function*() {
    let result = yield* block;
    let teardown = yield* frame.destroy();
    if (teardown.type === "rejected") {
      return teardown;
    } else {
      return result.exit.result;
    }
  })
  return {
    ...future,
    halt: () => futurize(function*() {
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

function createBlock<T>(frame: Frame, operation: () => Operation<T>): Block<T> {
  let exhaustion: Exhausted<T> | undefined = void 0;
  let observable = createObservable<IterationEvent<T>>();
  let controller = new AbortController();
  let { notify } = observable;

  let enter = evaluate<() => void>(function*() {
    yield* shift<void>(function*(k) {
      return k;
    });

    let iterator = lazy(() => operation()[Symbol.iterator]());

    let exit = yield* shift<Exited<T>>(function*(k) {
      let { signal } = controller;
      signal.onabort = () => {
        k({
          type: "exited",
          reason: "terminated",
          result: { type: "rejected", error: new Error('halted') },
        });
      };

      k({
        type: "exited",
        reason: "completed",
        result: yield* reduce({
          frame,
          iterator,
          notify,
          signal,
          start: $next(void 0),
        }),
      });
    });

    observable.notify(exit);

    let exhausted: Exhausted<T> = {
      type: "exhausted",
      exit,
      result: yield* (function*(): Computation<Result<void>> {
        if (exit.reason === 'completed') {
          if (exit.result.type === "resolved" ) {
            return { type: "resolved", value: void 0 };
          } else {
            return exit.result;
          }
        } else {
          return yield* reduce<void>({
            frame,
            iterator: iterator as () => Iterator<Instruction, void>,
            notify,
            start: $abort()
          });
        }
      })()
    }

    observable.notify(exhaustion = exhausted);
  });

  let block: Block<T> = create<Block<T>>('Block', {}, {
    enter,
    *abort() {
      return yield* shift<Result<void>>(function*(k) {
        yield* reset(function*() {
          let exhausted = yield* block;
          k(exhausted.result);

        });
        controller.abort();
      });
    },
    observe: observable.observe,

    toTask() {
      let future = futurize(function*() {
        let exhausted = yield* block;
        if (exhausted.result.type === "rejected") {
          return exhausted.result
        } else {
          return exhausted.exit.result;
        }
      });

      return {
        ...future,
        halt: () => futurize(() => block.abort())
      }
    },

    *[Symbol.iterator]() {
      if (exhaustion) {
        return exhaustion;
      }
      let observer = block.observe();
      while (true) {
        let event = yield* observer;
        if (event.type === "exhausted") {
          observer.drop();
          return event;
        }
      }
    }
  });
  return block;
}

interface ReduceOptions<T> {
  frame: Frame;
  iterator: () => Iterator<Instruction, T>;
  notify: ReturnType<typeof createObservable<IterationEvent<unknown>>>["notify"];
  signal?: AbortSignal;
  start(i: Iterator<Instruction, T>): IteratorResult<Instruction, T>;
}

function reduce<T>(options: ReduceOptions<T>): Computation<Result<T>> {
  let { frame, iterator, notify, signal, start: getNext } = options;
  return shift<Result<T>>(function*(exit) {
    while (!signal || !signal.aborted) {
      let next: IteratorResult<Instruction, T>;
      try {
        next = getNext(iterator());
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
        notify({ type: "instruction", instruction });
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
export function createFrame(parent?: Frame): Frame {
  let result: Result<void>;
  let children = new Set<Frame>();
  let running = new Set<Block>();
  let context = Object.create(parent?.context ?? {});
  let observable = createObservable<Result<void>>();

  let teardown = evaluate<Resolve<Result<void>>>(function*() {
    let current = yield* shift<Result<void>>(function*(k) {
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
  })

  function* close($result: Result<void>) {
    if (result) {
      return result;
    }

    teardown($result);

    return yield* frame;
  }

  let frame: Frame = create<Frame>('Frame', {
    id: ids++,
    context,
  }, {
    createChild() {
      let child = createFrame();
      children.add(child);
      evaluate(function*() {
        yield* child;
        children.delete(child);
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
    }
  });

  return frame;
}

function create<T>(tag: string, attrs: Partial<T>, prototype: Partial<T>): T {
  let properties: Record<string, PropertyDescriptor> = {};
  for (let [key, value] of Object.entries(attrs)) {
    properties[key] = { enumerable: true, value };
  }
  return Object.create({
    ...prototype,
    [Symbol.toStringTag]: tag,
  }, properties);
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
