import type { Instruction, Operation, Reject, Resolve, Task } from "./types.ts";
import { Computation, evaluate, reset, shift } from "./deps.ts";
import { createFuture, Result } from "./future.ts";
import { lazy } from "./lazy.ts";

export function run<T>(block: () => Operation<T>): Task<T> {
  let { future, resolve, reject } = createFuture<T>();

  let frame: Frame<T>;
  evaluate(function* () {
    frame = yield* createFrame<T>();
  });

  evaluate(function* () {
    let final = yield* frame.enter(block);
    if (final.destruction.type === "rejected") {
      reject(final.destruction.error);
    } else if (final.exit.type === "termination") {
      reject(new Error("halted"));
    } else if (final.exit.type === "failure") {
      reject(final.exit.error);
    } else {
      let { result } = final.exit;
      if (result.type === "rejected") {
        reject(result.error);
      } else {
        resolve(result.value);
      }
    }
  });

  return {
    ...future,
    halt() {
      let { future, resolve, reject } = createFuture<void>();
      evaluate(function* () {
        let result = yield* frame.destroy();
        if (result.type === "resolved") {
          resolve(result.value);
        } else {
          reject(result.error);
        }
      });
      return future;
    },
  };
}

interface Frame<T = unknown> extends Computation<Final<T>> {
  enter(block: () => Operation<T>): Computation<Final<T>>;
  destroy(): Computation<Result<void>>;
}

function createFrame<T>(): Computation<Frame<T>> {
  let final: Final<T> | undefined;
  let controller = new AbortController();

  return reset<Frame<T>>(function* () {
    let listeners: Array<(outcome: Final<T>) => void> = [];
    let [, block] = yield* shift<[Frame, () => Operation<T>]>(function* (k) {
      let self: Frame<T> = {
        *enter(block: () => Operation<T>) {
          k([self, block]);
          return yield* self;
        },
        *destroy() {
          controller.abort();
          let { destruction: result } = yield* self;
          return result;
        },
        *[Symbol.iterator]() {
          if (final) {
            return final;
          } else {
            return yield* shift<Final<T>>(function* (k) {
              listeners.push(k);
            });
          }
        },
      };
      return self;
    });

    let iterator = lazy(() => block()[Symbol.iterator]());

    let exitState = yield* reduce<T>({
      iterator,
      start: $next(undefined),
      signal: controller.signal,
    });

    // exit state has now been determined, so time to begin
    // shutdown process.

    // First cleanup anything that we might have been yielding to. This
    // will happen when exitState is a termination or a resource failure.

    let cleanup = yield* shift<Result<void>>(function* (k) {
      if (exitState.type !== "result" && exitState.state.type === "yielding") {
        k(yield* exitState.state.to.destroy());
      } else {
        k({ type: "resolved" } as Result<void>);
      }
    });

    // Now we run the iterator to completion, no matter what.
    // This cannot be aborted. We may want to warn if we see
    // a suspend instruction in this reduction.
    let exhaustion = yield* reduce<void>({
      iterator: iterator as () => Iterator<Instruction, void>,
      start: $abort(),
    });

    // The last bit of cleanup is to terminate all resources since they
    // may have been needed by the scope of the iterator.
    // TODO:
    let deallocation = yield* shift<Result<void>>(function* (k) {
      k({ type: "resolved" } as Result<void>);
    });

    let destruction = yield* shift<Result<void>>(function* (k) {
      if (deallocation.type === "rejected") {
        k(deallocation);
      } else if (exhaustion.type === "result") {
        k(exhaustion.result);
      } else if (exhaustion.type === "failure") {
        k({ type: "rejected", error: exhaustion.error });
      } else if (cleanup.type === "rejected") {
        k(cleanup);
      } else {
        k({ type: "resolved" } as Result<void>);
      }
    });

    //determine final Outcome, and then notify that we're done
    final = { exit: exitState, destruction };

    for (let listener of listeners) {
      listener(final);
    }
  });
}

interface ReduceOptions<T> {
  iterator(): Iterator<Instruction, T>;
  start: (i: Iterator<Instruction, T>) => IteratorResult<Instruction, T>;
  signal?: AbortSignal;
}

function reduce<T>(options: ReduceOptions<T>): Computation<Exit<T>> {
  let { iterator } = options;
  return shift<Exit<T>>(function* (exit) {
    let state: State = { type: "running" };
    let getNext = options.start;

    if (options.signal) {
      options.signal.addEventListener(
        "abort",
        () => exit({ type: "termination", state }),
      );
    }

    while (options.signal ? !options.signal.aborted : true) {
      state = { type: "running" };
      let next = getNext(iterator());
      if (next.done) {
        exit({
          type: "result",
          result: { type: "resolved", value: next.value },
        });
        break;
      } else {
        let instruction = next.value;
        if (instruction.type === "suspend") {
          state = { type: "suspended" };
          yield* shift<never>(function* () {});
        } else if (instruction.type === "action") {
          let { operation } = instruction;
          let result = yield* shift<Result>(function* (k) {
            let yieldingTo = yield* createFrame();
            let $return = (result: Result) => {
              evaluate(function* () {
                let termination = yield* yieldingTo.destroy();
                if (termination.type === "resolved") {
                  k(result);
                } else {
                  k(termination);
                }
              });
            };
            let resolve: Resolve = (value) =>
              $return({ type: "resolved", value });
            let reject: Reject = (error) =>
              $return({ type: "rejected", error });

            state = { type: "yielding", to: yieldingTo };

            let final = yield* yieldingTo.enter(() =>
              operation(resolve, reject)
            );

            if (
              final.exit.type === "result" &&
              final.exit.result.type === "resolved"
            ) {
              k({
                type: "rejected",
                error: new Error(
                  "reached the end of an action, but resolve() or reject() were never called",
                ),
              });
            }
          });
          getNext = result.type === "resolved"
            ? $next(result.value)
            : $throw(result.error);
        }
      }
    }
  });
}

type State =
  | { type: "running" }
  | { type: "suspended" }
  | { type: "yielding"; to: Frame };

type Exit<T> = {
  type: "result";
  result: Result<T>;
} | {
  type: "termination";
  state: State;
} | {
  type: "failure";
  state: State;
  error: Error;
};

type Final<T> = {
  exit: Exit<T>;
  destruction: Result<void>;
};

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
