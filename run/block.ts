import type {
  Block,
  Exhausted,
  Exited,
  Frame,
  Instruction,
  IterationEvent,
  Operation,
  Result,
} from "../types.ts";
import type { Computation } from "../deps.ts";

import { createObservable } from "./observer.ts";
import { evaluate, reset, shift } from "../deps.ts";
import { lazy } from "../lazy.ts";
import { create } from "./create.ts";

export function createBlock<T>(
  frame: Frame,
  operation: () => Operation<T>,
): Block<T> {
  let exhaustion: Exhausted<T> | undefined = void 0;
  let observable = createObservable<IterationEvent<T>>();
  let controller = new AbortController();
  let { notify } = observable;

  let enter = evaluate<() => void>(function* () {
    yield* shift<void>(function* (k) {
      return k;
    });

    let iterator = lazy(() => operation()[Symbol.iterator]());

    let exit = yield* shift<Exited<T>>(function* (k) {
      let { signal } = controller;
      signal.onabort = () => {
        k({
          type: "exited",
          reason: "terminated",
          result: { type: "rejected", error: new Error("halted") },
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
      result: yield* (function* (): Computation<Result<void>> {
        if (exit.reason === "completed") {
          if (exit.result.type === "resolved") {
            return { type: "resolved", value: void 0 };
          } else {
            return exit.result;
          }
        } else {
          return yield* reduce<void>({
            frame,
            iterator: iterator as () => Iterator<Instruction, void>,
            notify,
            start: $abort(),
          });
        }
      })(),
    };

    observable.notify(exhaustion = exhausted);
  });

  let block: Block<T> = create<Block<T>>("Block", {}, {
    enter,
    *abort() {
      return yield* shift<Result<void>>(function* (k) {
        yield* reset(function* () {
          let exhausted = yield* block;
          k(exhausted.result);
        });
        controller.abort();
      });
    },
    observe: observable.observe,

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
    },
  });
  return block;
}

interface ReduceOptions<T> {
  frame: Frame;
  iterator: () => Iterator<Instruction, T>;
  notify: ReturnType<
    typeof createObservable<IterationEvent<unknown>>
  >["notify"];
  signal?: AbortSignal;
  start(i: Iterator<Instruction, T>): IteratorResult<Instruction, T>;
}

function reduce<T>(options: ReduceOptions<T>): Computation<Result<T>> {
  let { frame, iterator, notify, signal, start: getNext } = options;
  return shift<Result<T>>(function* (exit) {
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

      let result = yield* shift<Result<unknown>>(function* (k) {
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
