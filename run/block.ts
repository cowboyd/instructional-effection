import type {
  Block,
  BlockResult,
  Frame,
  Instruction,
  Operation,
  Result,
} from "../types.ts";

import { createObservable } from "./observer.ts";
import { evaluate, reset, shift } from "../deps.ts";
import { lazy } from "../lazy.ts";
import { create } from "./create.ts";

type InstructionResult = {
  type: "settled";
  result: Result<unknown>;
} | {
  type: "interrupted";
};

export function createBlock<T>(
  frame: Frame,
  operation: () => Operation<T>,
): Block<T> {
  let result: BlockResult<T> | void = void 0;
  let results = createObservable<BlockResult<T>>();
  let interruption = createObservable<void>();
  let queue = createObservable<ReturnType<typeof $next>>();
  let controller = new AbortController();
  let { signal } = controller;

  signal.addEventListener("abort", () => interruption.notify());

  let enter = evaluate<() => void>(function* () {
    yield* shift<void>(function* (k) {
      return k;
    });

    let thunks = queue.observe();

    yield* reset(function* () {
      result = yield* results.first();
    });

    yield* reset(function* () {
      yield* interruption.first();
      queue.notify($abort());
    });

    queue.notify($next(void 0));

    let iterator = lazy(() => operation()[Symbol.iterator]());

    while (true) {
      let next: IteratorResult<Instruction>;
      let getNext = yield* thunks;
      try {
        next = getNext(iterator());
      } catch (error) {
        exhausted({ type: "rejected", error });
        break;
      }
      if (next.done) {
        exhausted({ type: "resolved", value: next.value });
        break;
      }
      let instruction = next.value;

      let result = yield* shift<InstructionResult>(function* (k) {
        yield* reset(function* () {
          yield* interruption.first();
          k({ type: "interrupted" });
        });

        try {
          k({ type: "settled", result: yield* instruction(frame, signal) });
        } catch (error) {
          k({ type: "settled", result: { type: "rejected", error } });
        }
      });

      if (result.type === "settled") {
        if (result.result.type === "rejected") {
          queue.notify($throw(result.result.error));
        } else {
          queue.notify($next(result.result.value));
        }
      }
    }
    thunks.drop();
  });

  function exhausted(outcome: Result<T>) {
    if (signal.aborted) {
      results.notify({
        type: "aborted",
        result: outcome as Result<void>,
      });
    } else {
      results.notify(outcome);
    }
  }

  let block: Block<T> = create<Block<T>>("Block", {
    name: operation.name,
  }, {
    enter,
    *abort() {
      return yield* shift<Result<void>>(function* (k) {
        yield* reset(function* () {
          let result = yield* block;
          if (result.type === "aborted") {
            k(result.result);
          } else {
            k(result as Result<void>);
          }
        });
        controller.abort();
      });
    },
    *[Symbol.iterator]() {
      if (result) {
        return result;
      }
      return yield* results.first();
    },
  });
  return block;
}

// deno-lint-ignore no-explicit-any
const $next = <T>(value: any) =>
  function $next(i: Iterator<Instruction, T>) {
    return i.next(value);
  };

const $throw = <T>(error: Error) =>
  function $throw(i: Iterator<Instruction, T>) {
    if (i.throw) {
      return i.throw(error);
    } else {
      throw error;
    }
  };

const $abort = <T>(value?: unknown) =>
  function $abort(i: Iterator<Instruction, T>) {
    if (i.return) {
      return i.return(value as unknown as T);
    } else {
      return { done: true, value } as IteratorResult<Instruction, T>;
    }
  };
