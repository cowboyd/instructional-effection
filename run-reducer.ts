import type { Instruction, Operation, Task } from "./types.ts";
import type { Result } from "./result.ts";

import { Computation, evaluate, shift } from "./deps.ts";
import { createFuture } from "./future.ts";

export function run<T>(block: () => Operation<T>): Task<T> {
  let frame = createFrame<T>();

  let { future, resolve, reject } = createFuture<T>();

  let task = {
    ...future,
    halt() {
      let { future, resolve, reject } = createFuture<void>();

      frame.dispatch({ type: "abort" });

      evaluate(function*() {
        let outcome = yield* frame;
        if (outcome.type === 'aborted') {
          if (outcome.result.type === 'resolved') {
            resolve();
          } else {
            reject(outcome.result.error);
          }
        }
      });

      return future;
    }
  }

  frame.dispatch({ type: "enter", block });

  evaluate(function*() {
    let final = yield* frame;
    if (final.type === 'resolved') {
      resolve(final.value);
    } else if (final.type === 'rejected') {
      reject(final.error);
    } else {
      reject(new Error('halted'));
    }
  })

  return task;
}

function createFrame<T>(): Frame<T> {
  let waiters: Array<(outcome: Outcome<T>) => void> = [];

  let next = evaluate<(state: State<T>) => void>(function*() {
    while (true) {
      let current = yield* shift<State<T>>(function*(k) {
        next = k;
        return k;
      });
      handle(frame, current);
    }
  });

  let frame: Frame<T> = {
    state: {
      status: 'new',
    },
    dispatch(transition) {
      //@ts-expect-error this can be sparse
      let handler = transitions[frame.state.status][name];
      if (handler) {
        next(handler(transition));
      } else {
        throw new Error("IllegalStateTransition");
      }
    },
    *[Symbol.iterator]() {
      if (frame.state.status === 'finalized') {
        return frame.state.outcome;
      } else {
        return yield* shift<Outcome<T>>(function*(k) {
          waiters.unshift(k);
        });
      }
    }
  };
  return frame;
}

const $next = (value: any) => (i: Iterator<Instruction>) => i.next(value);

const $throw = (error: Error)  => (i: Iterator<Instruction>) => {
  if (i.throw) {
    return i.throw(error);
  } else {
    throw error;
  }
};

const $abort = (value?: unknown) => (i: Iterator<Instruction>) => {
  if (i.return) {
    return i.return(value);
  } else {
    return { done: true, value } as IteratorResult<Instruction>;
  }
};

type Op = ReturnType<typeof $next> | ReturnType<typeof $throw> | ReturnType<typeof $abort>

type State<T> = {
  status: 'new';
} | {
  status: 'running';
  iterator: Iterator<Instruction<T>>;
  op: Op;
  currentValue: unknown;
} | {
  status: 'finalized';
  outcome: Outcome<T>;
}

type Outcome<T> = {
  type: 'resolved';
  value: T;
} | {
  type: 'rejected';
  error: Error;
} | {
  type: 'aborted';
  result: Result<void>;
}

interface Frame<T> extends Computation<Outcome<T>> {
  state: State<T>;
  dispatch(transition: Transition): void;
}

function handle<T>(frame: Frame<T>, state: State<T>): void {
  if (state.status === 'running') {
    let { op, iterator } = state;
    let next = op(iterator);
    if (next.done) {
      frame.dispatch({ type: "exhausted", value: next.value });
    } else {
      let instruction = next.value;
      if (instruction.type === 'suspend') {
        frame.dispatch({ type: "suspend" });
      } else if (instruction.type === 'action') {
        let { operation } = instruction;
        let child = createFrame<unknown>();
        let resolve = (value: unknown) => frame.dispatch({ type: 'settleAction', result: { type: 'resolved', value } });
        let reject = (error: Error) => frame.dispatch({type: 'settleAction', result: { type: 'rejected', error } });

        evaluate(function*() {
          let outcome = yield* child;
          if (outcome.type === 'resolved') {
            frame.dispatch({
                type: 'settleAction',
                result: {
                  type: 'rejected',
                  error: new Error('action ran to completion without ever calling resolve()');
                }
            });
          }
        });

        frame.dispatch({ type: 'yielding', child })
        child.dispatch({ type: 'enter', block: operation(resolve, reject)});
      }
  }
}

// const transitions = {
//   new: {
//     enter(enter: Enter): State<unknown> {
//       let { block } = enter;
//       let iterator = block()[Symbol.iterator]();
//       return {
//         status: 'running',
//         iterator,
//         currentValue: void 0,
//         op: $next(void 0),
//       );
//     },
//   },
// };

// interface Enter {
//   type: 'enter',
//   block: () => Operation<unknown>;
// }

// interface Abort {
//   type: 'abort';
// }

// type Transition = Enter | Abort


// // type Resolve = Continuation<unknown, void>;
// // type Reject = Continuation<Error, void>;

// import { action } from './instructions.ts';

// console.dir(await run(function*() {
//   let hello = yield* action(function*() {
//     return "world"
//   })
//   return { hello };
// }))
