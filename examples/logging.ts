import { run, sleep, spawn, log } from '../mod.ts';

await run(function*() {
  yield* log('begin');

  yield* spawn(function*() {
    yield* log('entering')
    try {
      while (true) {
        yield* sleep(100)
        yield* log('in loop');
      }
    } finally {
      yield* log('exiting');
    }
  });

  yield* sleep(1000);

  yield* log('end');
});

console.log('done');
