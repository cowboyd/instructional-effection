import { run, action, suspend } from '../mod.ts';

run(function*() {
  yield* action(function*(resolve) {
    let timeoutId = setTimeout(resolve, 2000);
    try {
      console.log('yawnn. time for a nap');
      yield* suspend();
    } finally {
      clearTimeout(timeoutId);
    }
  })
}).catch(error => console.error(error))
