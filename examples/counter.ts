import { Operation, resource, run, sleep } from "../mod.ts";

interface Counter {
  count: number;
  increment(): Operation<void>;
}

function useCounter(initial: number): Operation<Counter> {
  return resource(function* (provide) {
    let count = initial;

    let counter: Counter = {
      get count() {
        return count;
      },

      *increment() {
        yield* sleep(800);
        console.log(`${count} -> ${++count}`);
      },
    };

    yield* provide(counter);
  });
}

let count = await run(function* () {
  let counter = yield* useCounter(5);

  yield* counter.increment();

  yield* counter.increment();

  yield* counter.increment();

  return counter.count;
});

console.dir({ count });
