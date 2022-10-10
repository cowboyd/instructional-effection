import type { Instruction, Operation, Task } from './types.ts';
import { Computation, evaluate, reset, shift } from './deps.ts';
import { Outcome, Result, Resolve, Reject, forward } from './result.ts';
import { createFuture } from './future.ts';

export function run<T>(block: () => Operation<T>): Task<T> {
  let { future, resolve, reject } = createFuture<T>();

  let frame: Frame<T>;
  evaluate(function*() {
    frame = yield* createFrame<T>();
  });

  evaluate(function*() {
    let result = yield* frame.enter(block);
    if (result.type === 'terminated') {
      reject(new Error('halted'));
    } else {
      forward(result, resolve, reject);
    }
  })

  return {
    ...future,
    halt() {
      let { future, resolve, reject } = createFuture<void>();
      evaluate(function*() {
        let result = yield* frame.terminate();
        forward(result, resolve, reject);
      })

      return future;
    }
  };
}

interface Frame<T = unknown> extends Computation<Outcome<T>> {
  enter(block: () => Operation<T>): Computation<Outcome<T>>;
  terminate(): Computation<Result<void>>;
}

function createFrame<T>(): Computation<Frame<T>> {
  let outcome: Outcome<T> | undefined;
  return reset<Frame<T>>(function*() {
    let listeners: Array<(outcome: Outcome<T>) => void> = [];
    let [frame, block] = yield* shift<[Frame, () => Operation<any>]>(function*(k) {
      let self: Frame<T> =  {
        *enter(block: () => Operation<T>) {
          k([self, block]);
          return yield* self;
        },
        *terminate() { return { type: 'resolved', value: void 0 } },
        *[Symbol.iterator]() {
          if (outcome) {
            return outcome;
          } else {
            return yield* shift<Outcome<T>>(function*(k) {
              listeners.push(k);
            });
          }
        }
      };
      return self;
    });

    // when exitState is defined, we now know if we exited because of
    //1. termination
    //2. result
    let exitState: Exit<T> | undefined = void 0;
    exitState = yield* shift<Exit<T>>(function*(exit) {
      let iterator = block()[Symbol.iterator]();
      let getNext = $next<T>(void 0);
      let state: State = 'running';
      while (typeof exitState === 'undefined') {
        let next = getNext(iterator);
        if (next.done) {
          exit({ type: 'resolved', value: next.value });
        } else {
          let instruction = next.value;
          if (instruction.type === 'suspend') {
            state = 'suspended';
            yield* shift<never>(function*() {});
          } else if (instruction.type === 'action') {
            let { operation } = instruction;
            let result = yield* shift<Result>(function*(k) {
              let yieldingTo = yield* createFrame();
              let $return = (result: Result) => {
                evaluate(function*() {
                  let termination = yield* yieldingTo.terminate();
                  if (termination.type === 'resolved') {
                    k(result);
                  } else {
                    k(termination);
                  }
                })
              }
              let resolve: Resolve = (value) => $return({ type: 'resolved', value });
              let reject: Reject = (error) => $return({ type: 'rejected', error });

              let done = yield* yieldingTo.enter(() => operation(resolve, reject));
              if (done.type === 'resolved' && typeof result !== 'undefined') {
                k({ type: 'rejected', error: new Error('reached the end of an action, but resolve() or reject() were never called')});
              }
            });
          }
        }
      }
    });

    // we are now halting everything
    // 1. kill anything that we're yielding to
    // 2. abort and drain the iterator
    // 3. destroy all resources
    let destruction = yield* shift<Result<void>>(function*(k) {
      k({ type: 'resolved', value: void 0 });
    });

    //determine final Outcome, and then notify that we're done
    outcome = { type: 'terminated', result: { type: 'resolved', value: void 0 }};

    for (let listener of listeners) {
      listener(outcome);
    }
  });
}

type State = 'running' | 'suspended' | {
  yieldingTo: Frame;
}

type Exit<T> = Result<T> | {
    type: 'escape';
    state: State;
    reason: 'termination' | 'failure';
  }

const $next = <T>(value: any) => (i: Iterator<Instruction, T>) => i.next(value);

const $throw = <T>(error: Error)  => (i: Iterator<Instruction, T>) => {
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


import { action, suspend } from "./mod.ts";

run(function* () {
  yield* action<void>(function*(resolve) {
    let timeoutId = setTimeout(resolve, 2000);
    try {
      console.log("yawnn. time for a nap");
      yield* suspend();
    } finally {
      console.log("woke up");
      clearTimeout(timeoutId);
    }
  });
}).catch((error) => console.error(error));
