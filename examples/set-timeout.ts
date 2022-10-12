import { action, run, suspend } from "../mod.ts";

await run(() =>
  action<void>(function* (resolve) {
    let timeoutId = setTimeout(resolve, 2000);
    try {
      console.log("yawn. time for a nap");
      yield* suspend();
    } finally {
      clearTimeout(timeoutId);
      console.log("woke up");
    }
  })
);
