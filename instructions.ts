import type {
  Frame,
  Operation,
  Provide,
  Reject,
  Resolve,
  Result,
  Task,
} from "./types.ts";

import { reset, shift } from "./deps.ts";
import { createFrameTask } from "./run/frame.ts";
import { createEventStream } from "./run/event-stream.ts";

export function suspend(): Operation<void> {
  return {
    *[Symbol.iterator]() {
      return yield function Suspend(_, signal) {
        return shift<Result<void>>(function* (k) {
          if (signal.aborted) {
            k.tail({ type: "resolved", value: void 0 });
          }
        });
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
          let results = createEventStream<void, Result<T>>();

          let resolve: Resolve<T> = (value) =>
            results.close({ type: "resolved", value });
          let reject: Reject = (error) =>
            results.close({ type: "rejected", error });

          let child = frame.createChild();
          let block = child.run(() => operation(resolve, reject));

          yield* reset(function* () {
            let result = yield* results;
            let destruction = yield* child.destroy();
            if (destruction.type === "rejected") {
              k.tail(destruction);
            } else {
              k.tail(result);
            }
          });

          yield* reset(function* () {
            let result = yield* block;
            if (result.type === "rejected") {
              results.close(result);
            }
          });

          block.enter();
        });
      };
    },
  };
}

export function go<T>(
  operation: () => Operation<T>,
): Operation<Task<Result<T>>> {
  function Go(frame: Frame) {
    return shift<Result<Task<Result<T>>>>(function* (k) {
      let child = frame.createChild();
      let block = child.run(function* () {
        try {
          let value = yield* operation();
          let result: Result<T> = {
            type: "resolved",
            value,
          };
          return result;
        } catch (error) {
          let result: Result<T> = {
            type: "rejected",
            error,
          };
          return result;
        }
      });

      let task = createFrameTask(child, block);

      block.enter();

      k.tail({ type: "resolved", value: task });
    });
  }

  return {
    *[Symbol.iterator]() {
      return yield Go;
    },
  };
}

export function spawn<T>(operation: () => Operation<T>): Operation<Task<T>> {
  return {
    *[Symbol.iterator]() {
      return yield function Spawn(frame) {
        return shift<Result<Task<T>>>(function* (k) {
          let child = frame.createChild();
          let block = child.run(operation);

          let task = createFrameTask(child, block);

          yield* reset(function* () {
            let result = yield* block;
            let destruction = yield* child.destroy();
            if (destruction.type === "rejected") {
              yield* frame.crash(destruction.error);
            } else if (
              result.type === "aborted" &&
              result.result.type === "rejected"
            ) {
              yield* frame.crash(result.result.error);
            } else if (result.type === "rejected") {
              yield* frame.crash(result.error);
            }
          });

          block.enter();

          k.tail({ type: "resolved", value: task });
        });
      };
    },
  };
}

export function resource<T>(
  operation: (provide: Provide<T>) => Operation<void>,
): Operation<T> {
  return {
    *[Symbol.iterator]() {
      return yield function Resource(frame) {
        return shift<Result<T>>(function* (k) {
          let child = frame.createChild();
          let provide = (value: T): Operation<void> => {
            return {
              *[Symbol.iterator]() {
                return yield () =>
                  shift<Result<void>>(function* () {
                    k.tail({ type: "resolved", value });
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

          yield* reset(function* () {
            let done = yield* block;
            if (done.type === "rejected") {
              k.tail(done);
            } else if (done.type === "resolved") {
              k.tail({
                type: "rejected",
                error: new Error(
                  `resource exited without ever providing anything`,
                ),
              });
            }
          });

          block.enter();
        });
      };
    },
  };
}

export function getframe(): Operation<Frame> {
  return {
    *[Symbol.iterator]() {
      return yield (frame) =>
        shift<Result<Frame>>(function* (k) {
          k.tail({ type: "resolved", value: frame });
        });
    },
  };
}
