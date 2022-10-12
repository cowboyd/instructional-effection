import { action, Operation, run, suspend } from "../mod.ts";

function num(): Operation<number> {
  return action(function* (resolve) {
    let timeout = setTimeout(() => resolve(Math.random()), 10);
    try {
      yield* suspend();
    } finally {
      clearTimeout(timeout);
    }
  });
}

let sum = await run(function* () {
  let left = yield* num();
  let right = yield* num();
  return left + right;
});

console.dir({ sum });
