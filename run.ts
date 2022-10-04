import type { Instruction, Operation, Task } from "./types.ts";
import type { Result  } from "./result.ts";
import { Computation, Continuation, evaluate, reset, shift } from "../../@frontside/continuation/mod.ts";
import { createFuture } from "./future.ts";

export function run<T>(block: () => Operation<T>): Task<T> {

  let frame = evaluate<Frame<T>>(function*() {
    return yield* createTaskFrame(block);
  });

  let result = createFuture<T>();

  let task: Task<T> = {
    ...result.future,
    halt() {
      let { resolve, reject, future } = createFuture<void>();
      evaluate(function*() {
        let result = yield* frame.destroy();
        if (result.type === 'rejected') {
          reject(result.error)
        } else {
          resolve();
        }
      });
      return future;
    }
  }

  evaluate(function*() {
    let outcome = yield* frame.enter();
    if (outcome.type === 'aborted') {
      result.reject(new Error('halted'));
    } else {
      if (outcome.type === 'rejected') {
        result.reject(outcome.error);
      } else {
        result.resolve(outcome.value);
      }
    }
  });

  return task;
}

function createTaskFrame<T>(block: () => Operation<T>): Computation<Frame<T>> {
  return reset<Frame<T>>(function*() {
    let resources = new Set<Frame>();

    let frame = yield* shift<Frame<T>, () => Computation<Outcome<T>>>(function*(begin) {
      let self: Frame<T> = {
        resources,
        enter: () => begin(self)(),
        *destroy() {
          return { type: 'resolved', value: void 0 };
        }
      };
      return self;
    });

    let outcome = yield* shift(function*(settle) {
      try {
        let instructions = block()[Symbol.iterator]();
        let getNext = $next(undefined);
        while (true) {
          let next = getNext(instructions);
          if (next.done) {
            return function*() {
              yield* settle({ type: 'resolved', value: next.value })();
            }
          } else {
            let instruction  = next.value;
            if (instruction.type === 'action') {
              let { operation } = instruction;
              let result = yield* shift<Outcome<unknown>>(function*(k) {
                function resolve(value: unknown) {
                  evaluate(function*() {
                    let destruction = yield* child.destroy();
                    delete frame.yieldingTo;
                    if (destruction.type === 'rejected') {
                      settle(destruction);
                    } else {
                      settle({ type: 'resolved', value });
                    }
                  });
                }
                function reject(error: Error) {
                  evaluate(function*() {
                    let destruction = yield* child.destroy();
                    delete frame.yieldingTo;
                    if (destruction.type === 'rejected') {
                      settle(destruction);
                    } else {
                      settle({ type: 'rejected', error });
                    }
                  })

                }
                let body = () => operation(resolve, reject);
                let child = frame.yieldingTo = yield* createTaskFrame(body);
                k(yield* child.enter());
              });
              if (result.type === 'rejected') {
                getNext = $throw(result.error);
              } else if (result.type === 'resolved') {
                getNext = $next(result.value);
              }
            }
          }
        }
      } catch (error) {
        return function*() {
          yield* settle({ type: 'rejected', error });
        }
      }
    });

    // destruction logic here.
    let destruction = yield* destroy(frame);

  });
}

type Outcome<T> = Result<T> | { type: 'aborted', result: Result<void> }

export interface Frame<T = unknown> {
  resources: Set<Frame>;
  yieldingTo?: Frame;
  enter(): Computation<Outcome<T>>;
  destroy(): Computation<Result<void>>;
}

function $next<T>(value?: any) {
  return (i: Iterator<Instruction, T, any>) => i.next(value);
}

function $throw(error: Error) {
  return (i: Iterator<Instruction<any>>) => {
    if (i.throw) {
      return i.throw(error);
    } else {
      throw error;
    }
  };
}

function $return(value?: any) {
  return (i: Iterator<Instruction>) => {
    if (i.return) {
      return i.return(value);
    } else {
      return { done: true, value } as IteratorResult<Instruction>;
    }
  };
}
