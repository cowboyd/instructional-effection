import { describe, expect, it } from "./suite.ts";
import { run, sleep } from "../mod.ts";
import { go } from "../instructions.ts";

let goTests = describe("go()");

it(goTests, "resolves parent when child error is caught", async () => {
  let child;
  let error = new Error("moo");
  let root = run(function* () {
    child = yield* go(function* () {
      yield* sleep(1);
      throw error;
    });

    yield* child;
    return "success";
  });

  await expect(root).resolves.toEqual("success");
  await expect(child).resolves.toEqual({
    type: "rejected",
    error,
  });
});
