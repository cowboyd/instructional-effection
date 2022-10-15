import type { Instruction, Operation, Reject, Resolve, Task } from "./types.ts";
import { Computation, evaluate, reset, shift } from "./deps.ts";
import { createFuture, Result } from "./future.ts";
import { lazy } from "./lazy.ts";

export function run<T>(block: () => Operation<T>): Task<T> {
  let frame: NewFrame<T>;
  evaluate<NewFrame<T>>(function* () {
    frame = yield* createFrame<T>();
  });

  //@ts-expect-error frame will always be defined
  return createTask(frame, block);
}

function createTask<T>(
  { enter, frame }: NewFrame<T>,
  block: () => Operation<T>,
): Task<T> {
  let { future, resolve, reject } = createFuture<T>();

  evaluate(function* () {
    let { outcome } = yield* enter(block);
    if (outcome.type === "resolved") {
      resolve(outcome.value);
    } else {
      reject(outcome.error);
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
  context: Record<string, unknown>;
  resources: Set<Frame>;
  state: State;
  destroy(): Computation<Result<void>>;
}

interface NewFrame<T> {
  frame: Frame<T>;
  enter(block: () => Operation<T>): Computation<Final<T>>;
}

function* createFrame<T>(parent?: Frame): Computation<NewFrame<T>> {
  let context = parent ? Object.create(parent.context) : {};
  let listeners: Array<(outcome: Final<T>) => void> = [];
  let final: Final<T> | undefined;
  let resources = new Set<Frame>();
  let controller = new AbortController();
  let { signal } = controller;

  let frame: Frame<T> = {
    context,
    resources,
    state: { type: "running", current: { type: "resolved", value: void 0 } },
    *[Symbol.iterator]() {
      if (final) {
        return final;
      } else {
        return yield* shift<Final<T>>(function* (k) {
          listeners.push(k);
        });
      }
    },
    *destroy() {
      controller.abort();
      let { destruction: result } = yield* frame;
      return result;
    },
  };

  type Enter<T> = (fn: () => Operation<T>) => Computation<Final<T>>;
  let enter = yield* reset<Enter<T>>(function* () {
    let block = yield* shift<() => Operation<T>>(function* (k) {
      return function* (block: () => Operation<T>) {
        k(block);
        return yield* frame;
      };
    });

    let iterator = lazy(() => block()[Symbol.iterator]());

    let exitState = yield* reduce<T>({
      frame,
      iterator,
      start: $next(undefined),
      signal,
    });

    // exit state has now been determined, so time to begin
    // shutdown process.

    // First cleanup anything that we might have been yielding to. This
    // will happen when exitState is a termination or a resource failure.

    let cleanup = { type: "resolved" } as Result<void>;

    if (exitState.type !== "result" && exitState.state.type === "yielding") {
      cleanup = yield* exitState.state.to.destroy();
    }

    // Now we run the iterator to completion, no matter what.
    // This cannot be aborted. We may want to warn if we see
    // a suspend instruction in this reduction.
    let exhaustion = yield* reduce<void>({
      frame,
      iterator: iterator as () => Iterator<Instruction, void>,
      start: $abort(),
    });

    // The last bit of cleanup is to terminate all resources since they
    // may have been needed by the scope of the iterator.
    // TODO:
    let deallocation = { type: "resolved" } as Result<void>;
    for (let resource of [...resources].reverse()) {
      let dealloc = yield* resource.destroy();
      if (dealloc.type === "rejected") {
        deallocation = dealloc;
      }
    }

    let destruction = { type: "resolved" } as Result<void>;
    if (deallocation.type === "rejected") {
      destruction = deallocation;
    } else if (exhaustion.type === "result") {
      destruction = exhaustion.result;
    } else if (exhaustion.type === "failure") {
      destruction = { type: "rejected", error: exhaustion.error };
    } else if (cleanup.type === "rejected") {
      destruction = cleanup;
    } else {
      destruction = { type: "resolved" } as Result<void>;
    }

    let outcome: Result<T> = {
      type: "rejected",
      error: new Error("outcome unknown"),
    };

    if (destruction.type === "rejected") {
      outcome = destruction;
    } else if (exitState.type === "result") {
      outcome = exitState.result;
    } else if (exitState.type === "termination") {
      outcome = { type: "rejected", error: new Error("halted") };
    } else {
      outcome = { type: "rejected", error: exitState.error };
    }

    //determine final Outcome, and then notify that we're done
    final = { outcome, exit: exitState, destruction };

    for (let listener of listeners) {
      listener(final);
    }
  });
  return { frame, enter };
}

interface ReduceOptions<T> {
  frame: Frame;
  iterator(): Iterator<Instruction, T>;
  start: (i: Iterator<Instruction, T>) => IteratorResult<Instruction, T>;
  signal?: AbortSignal;
}

function* reduce<T>(options: ReduceOptions<T>): Computation<Exit<T>> {
  let { iterator, frame, signal } = options;
  let { resources } = frame;

  try {
    return yield* shift<Exit<T>>(function* (exit) {
      if (signal) {
        let listener = () => exit({ type: "termination", state: frame.state });
        signal.addEventListener("abort", listener, {
          once: true,
        });
      }

      let getNext = options.start;

      while (!signal || !signal.aborted) {
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
            let { then } = instruction;
            frame.state = { type: "suspended" };
            yield* shift<never>(function* () {
              then && then();
            });
          } else if (instruction.type === "action") {
            let { operation } = instruction;
            let yieldingTo = yield* createFrame(frame);
            frame.state = { type: "yielding", to: yieldingTo.frame };
            let result = yield* shift<Result>(function* instruction(k) {
              let $return = (result: Result) => {
                evaluate(function* () {
                  let termination = yield* yieldingTo.frame.destroy();
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
            frame.state = { type: "running", current: result };
            getNext = result.type === "resolved"
              ? $next(result.value)
              : $throw(result.error);
          } else if (instruction.type === "resource") {
            let { operation } = instruction;
            let resource = yield* createFrame(frame);
            frame.state = { type: "yielding", to: resource.frame };
            let result = yield* shift<Result>(function* (k) {
              let provisioned = false;

              let provide = (value: unknown) => {
                provisioned = true;
                let then = () => {
                  k({ type: "resolved", value });
                };
                return [{ type: "suspend", then }] as Operation<void>;
              };

              yield* reset(function* () {
                let { outcome } = yield* resource.enter(() =>
                  operation(provide)
                );
                if (outcome.type === "rejected") {
                  if (provisioned) {
                    let { state } = frame;
                    exit({ type: "failure", state, error: outcome.error });
                  } else {
                    k(outcome);
                  }
                }
              });
            });
            frame.state = { type: "running", current: result };
            resources.add(resource.frame);
            getNext = result.type === "resolved"
              ? $next(result.value)
              : $throw(result.error);
          } else if (instruction.type === "getframe") {
            frame.state = {
              type: "running",
              current: { type: "resolved", value: frame },
            };
            getNext = $next(frame);
          }
        }
      }
    });
  } catch (error) {
    return { type: "result", result: { type: "rejected", error } };
  }
}

type State =
  | { type: "running"; current: Result }
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
  outcome: Result<T>;
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
