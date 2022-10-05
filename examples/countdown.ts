import { run, sleep } from "../mod.ts";

run(function* () {
  for (let i = 5; i > 0; i--) {
    console.log(`${i}...`);
    yield* sleep(1000);
  }
  console.log("blastoff!");
});
