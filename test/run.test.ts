import { describe, expect, it } from "./suite.ts";
import { expect as $expect, run } from "../mod.ts";

describe("run()", () => {
  it("propagates errors", async () => {
    try {
      await run(function* () {
        throw new Error("boom");
      });
      throw new Error("expected error to propagate");
    } catch (error) {
      expect(error.message).toEqual("boom");
    }
  });
  it("propagates errors from promises", async () => {
    try {
      await run(function* () {
        yield* $expect(Promise.reject(new Error("boom")));
      });
      throw new Error("expected error to propagate");
    } catch (error) {
      expect(error.message).toEqual("boom");
    }
  });
});
