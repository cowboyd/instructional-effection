import type { Instruction, Operation, Task } from "./types.ts";
import type { Result } from "./result.ts";
import {
  Computation,
  Continuation,
  evaluate,
  reset,
  shift,
} from "./deps.ts";
import { createFuture } from "./future.ts";

export function run<T>(block: () => Operation<T>): Task<T> {
  let frame = evaluate<Frame<T>>(function* () {
    return yield* createTaskFrame(block);
  });

  let result = createFuture<T>();

  let task: Task<T> = {
    ...result.future,
    halt() {
      let { resolve, reject, future } = createFuture<void>();
      evaluate(function* () {
        let result = yield* frame.destroy();
        if (result.type === "rejected") {
          reject(result.error);
        } else {
          resolve();
        }
      });
      return future;
    },
  };

  evaluate(function* () {
    let outcome = yield* frame.enter();
    if (outcome.type === "aborted") {
      result.reject(new Error("halted"));
    } else {
      if (outcome.type === "rejected") {
        result.reject(outcome.error);
      } else {
        result.resolve(outcome.value);
      }
    }
  });

  return task;
}

function createTaskFrame<T>(block: () => Operation<T>): Computation<Frame<T>> {
  return reset<Frame<T>>(function* () {
    let resources = new Set<Frame>();
    let aborted = false;
    let unsuspend = () => {};
    let destruction: Result<void> | undefined;
    let destroyers = new Set<Continuation<Result<void>>>();
    let frame = yield* shift<Frame<T>, () => Computation<Outcome<T>>>(
      function* (begin) {
        let self: Frame<T> = {
          resources,
          *enter() {
            let next = begin(self);
            return yield* next();
          },
          *destroy() {
            if (destruction) {
              return destruction;
            } else {
              return yield* shift<Result<void>>(function* (k) {
                destroyers.add(k);
                if (!aborted) {
                  aborted = true;
                  if (self.yieldingTo) {
                    yield* self.yieldingTo.destroy();
                  } else {
                    unsuspend();
                  }
                }
              });
            }
          },
        };
        return self;
      },
    );

    let outcome = yield* shift<Outcome<T>>(function* (settle) {
      return function* () {
        try {
          let interrupted = false;
          let instructions = block()[Symbol.iterator]();
          let getNext = $next<T>(undefined);
          while (true) {
            if (aborted && !interrupted) {
              interrupted = true;
              getNext = $return();
            }
            let next = getNext(instructions);
            if (next.done) {
              let { value } = next;
              if (aborted) {
                return yield* settle({
                  type: "aborted",
                  result: {
                    type: "resolved",
                    value: void 0,
                  },
                })();
              } else {
                return yield* settle({ type: "resolved", value })();
              }
            } else {
              let instruction = next.value;
              if (instruction.type === "action") {
                let { operation } = instruction;
                let result = yield* shift<Outcome<unknown>>(function* (k) {
                  function resolve(value: unknown) {
                    evaluate(function* () {
                      let destruction = yield* child.destroy();
                      delete frame.yieldingTo;
                      if (destruction.type === "rejected") {
                        k(destruction);
                      } else {
                        k({ type: "resolved", value });
                      }
                    });
                  }
                  function reject(error: Error) {
                    evaluate(function* () {
                      let destruction = yield* child.destroy();
                      delete frame.yieldingTo;
                      if (destruction.type === "rejected") {
                        k(destruction);
                      } else {
                        k({ type: "rejected", error });
                      }
                    });
                  }
                  let body = () => operation(resolve, reject);
                  let child = frame.yieldingTo = yield* createTaskFrame(body);
                  let outcome = yield* child.enter();
                  delete frame.yieldingTo;
                  k(outcome);
                });

                if (result.type === "rejected") {
                  getNext = $throw(result.error);
                } else if (result.type === "resolved") {
                  getNext = $next(result.value);
                } else {
                  //it was halted which means that we were the ones that
                  //did it.
                }
              } else if (instruction.type === "suspend") {
                yield* shift<void>(function* (k) {
                  unsuspend = k;
                });
                unsuspend = () => {};
              }
            }
          }
        } catch (error) {
          let result: Result<void> = { type: "rejected", error };
          if (aborted) {
            return yield* settle({ type: "aborted", result })();
          } else {
            return yield* settle(result)();
          }
        }
      };
    });

    destruction = { type: "resolved", value: void 0 };

    for (let destroyer of destroyers) {
      destroyer(destruction);
    }

    return function* () {
      return outcome;
    };
  });
}

type Outcome<T> = Result<T> | { type: "aborted"; result: Result<void> };

export interface Frame<T = unknown> {
  resources: Set<Frame>;
  yieldingTo?: Frame;
  enter(): Computation<Outcome<T>>;
  destroy(): Computation<Result<void>>;
}

function $next<T>(value?: unknown) {
  return (i: Iterator<Instruction, T, unknown>) => i.next(value);
}

function $throw<T>(error: Error) {
  return (i: Iterator<Instruction, T, unknown>) => {
    if (i.throw) {
      return i.throw(error);
    } else {
      throw error;
    }
  };
}

function $return(value?: unknown) {
  return (i: Iterator<Instruction>) => {
    if (i.return) {
      return i.return(value);
    } else {
      return { done: true, value } as IteratorResult<Instruction>;
    }
  };
}
