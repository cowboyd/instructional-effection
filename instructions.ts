import type {
  Frame,
  Operation,
  Provide,
  Reject,
  Resolve,
  Result,
  Task,
} from "./types.ts";

import { evaluate, reset, shift } from "./deps.ts";
import { createFrameTask } from "./run/frame.ts";

export function suspend(): Operation<void> {
  return {
    *[Symbol.iterator]() {
      return yield function Suspend() {
        return shift<Result<void>>(function* () {});
      };
    },
  };
}

export function action<T>(
  operation: (resolve: Resolve<T>, reject: Reject) => Operation<void>,
): Operation<T> {
  return {
    *[Symbol.iterator]() {
      return yield function Action(frame) {
        return shift<Result<T>>(function* (k) {
          let result: Result<T> | undefined = void 0;
          let $resolve: Resolve<T> = (value) => {
            result = { type: "resolved", value };
          };
          let $reject: Reject = (error) => {
            result = { type: "rejected", error };
          };
          let resolve: Resolve<T> = (value) => $resolve(value);
          let reject: Reject = (error) => $reject(error);

          let child = frame.createChild();
          let block = child.run(() => operation(resolve, reject));

          evaluate(function* () {
            let observer = block.observe();

            let $return = yield* reset<Resolve<Result<T>>>(function* () {
              let result = yield* shift<Result<T>>(function* ($return) {
                return $return;
              });
              let destruction = yield* child.destroy();
              if (destruction.type === "rejected") {
                k(destruction);
              } else {
                k(result);
              }
            });

            yield* reset(function* () {
              let result = yield* child;
              if (result.type === "rejected") {
                $return(result);
              }
            });

            while (true) {
              let event = yield* observer;
              if (result) {
                $return(result);
                break;
              } else if (event.type === "exhausted") {
                if (event.result.type === "rejected") {
                  $return(event.result);
                } else if (event.exit.result.type === "rejected") {
                  $return(event.exit.result);
                }
                break;
              } else {
                $resolve = (value) => $return({ type: "resolved", value });
                $reject = (error) => $return({ type: "rejected", error });
              }
            }
            observer.drop();
          });
          block.enter();
        });
      };
    },
  };
}

export function spawn<T>(operation: () => Operation<T>): Operation<Task<T>> {
  return {
    *[Symbol.iterator]() {
      return yield (frame) =>
        shift<Result<Task<T>>>(function* (k) {
          let child = frame.createChild();
          let block = child.run(operation);

          let task = createFrameTask(child, block);

          block.enter();
          k({ type: "resolved", value: task });
          let { exit } = yield* block;
          let destruction = yield* child.destroy();
          if (destruction.type === "rejected") {
            yield* frame.crash(destruction.error);
          } else if (
            exit.reason === "completed" && exit.result.type === "rejected"
          ) {
            yield* frame.crash(exit.result.error);
          }
        });
    },
  };
}

export function resource<T>(
  operation: (provide: Provide<T>) => Operation<void>,
): Operation<T> {
  return {
    *[Symbol.iterator]() {
      return yield (frame) =>
        shift<Result<T>>(function* (k) {
          let child = frame.createChild();
          let provide = (value: T): Operation<void> => {
            return {
              *[Symbol.iterator]() {
                return yield () =>
                  shift<Result<void>>(function* () {
                    k({ type: "resolved", value });
                  });
              },
            };
          };
          yield* reset(function* () {
            let result = yield* child;
            if (result.type === "rejected") {
              yield* frame.crash(result.error);
            }
          });
          let block = child.run(() => operation(provide));
          block.enter();
          let done = yield* block;
          if (done.exit.reason === "completed") {
            if (done.exit.result.type === "rejected") {
              k(done.exit.result);
            } else {
              k({
                type: "rejected",
                error: new Error(
                  `resource exited without ever providing anything`,
                ),
              });
            }
          }
        });
    },
  };
}

export function getframe(): Operation<Frame> {
  return {
    *[Symbol.iterator]() {
      return yield (frame) =>
        shift<Result<Frame>>(function* (k) {
          k({ type: "resolved", value: frame });
        });
    },
  };
}
