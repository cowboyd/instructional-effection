import { describe, it, expect } from "./suite.ts";
import { createScope, action, resource } from "../mod.ts";

describe("Scope", () => {
  it("can be used to run actions", async () => {
    let scope = createScope();
    let t1 = scope.run(function*() { return 1; });
    let t2 = scope.run(function*() { return 2; });
    expect(await t1).toEqual(1)
    expect(await t2).toEqual(2)
  });

  it("can be used to run bare resources", async () => {
    let scope = createScope();
    let t1 = await scope.run(() => tester);
    let t2 = await scope.run(() => tester);
    expect(t1.status).toEqual("open");
    expect(t2.status).toEqual("open");
    await scope.close();
    expect(t1.status).toEqual("closed");
    expect(t2.status).toEqual("closed");
  });
});

interface Tester {
  status: "open" | "closed";
}

const tester = resource<Tester>(function*(provide) {
  let t: Tester = { status: "open" };
  try {
    yield* provide(t);
  } finally {
    t.status = "closed";
  }
});
