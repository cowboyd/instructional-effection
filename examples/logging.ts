import {
  log,
  LogContext,
  Operation,
  resource,
  run,
  sleep,
  spawn,
  stream,
  Task,
} from "../mod.ts";

await run(function* () {
  yield* useConsoleLogger();
  yield* log("begin");

  yield* spawn(function* () {
    yield* log("entering");
    try {
      while (true) {
        yield* sleep(800);
        yield* log("in loop 1");
      }
    } finally {
      yield* log("exiting");
    }
  });

  yield* spawn(function* () {
    while (true) {
      yield* sleep(300);
      yield* log("in second loop");
    }
  });

  yield* sleep(10000);

  yield* log("end");
});

console.log("done");

import { readKeypress } from "https://deno.land/x/keypress@0.0.8/mod.ts";

function useConsoleLogger(): Operation<void> {
  return resource(function* (provide) {
    let toggle = yield* useToggle(function* () {
      let log = yield* LogContext;
      let msgs = yield* log.output;
      for (let next = yield* msgs; !next.done; next = yield* msgs) {
        console.dir(next.value);
      }
    });

    yield* spawn(function* () {
      let keys = yield* stream(readKeypress());
      for (let next = yield* keys; !next.done; next = yield* keys) {
        yield* toggle();
      }
    });

    yield* provide();
  });
}

type Toggle = () => Operation<void>;

function useToggle(block: () => Operation<void>): Operation<Toggle> {
  return resource(function* (provide) {
    let task: Task<void> | undefined;

    try {
      yield* provide(function* () {
        if (task) {
          yield* task.halt();
          task = void 0;
        } else {
          task = yield* spawn(block);
        }
      });
    } finally {
      if (task) {
        yield* task.halt();
      }
    }
  });
}
