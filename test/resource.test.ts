import { describe, expect, it } from "./suite.ts";
import { run, suspend, sleep, spawn, resource } from "../mod.ts";

const myResource = {
  name: 'myResource',
  [Symbol.iterator]: () => resource<{ status: string}> (function*(provide) {
    let container = { status: 'pending' };
    yield* spawn(function*() {
      yield* sleep(5);
      container.status = 'active';
    });

    yield* sleep(1);

    try {
      yield* provide(container);
    } finally {
      container.status = 'finalized';
    }
  })[Symbol.iterator]()
}

describe('resource', () => {
  describe('with spawned resource', () => {
    it('runs resource in task scope', async () => {
      await run(function*() {
        let result = yield* myResource;
        expect(result.status).toEqual('pending');
        yield* sleep(10);
        expect(result.status).toEqual('active');
      });
    });

    it('throws init error', async () => {
      let task = run(function*() {
        yield* resource(function*() {
          throw new Error('moo');
        });
        yield* suspend();
      });

      await expect(task).rejects.toHaveProperty('message', 'moo');
    });

    it('terminates resource when task completes', async () => {
      let result = await run(function*() {
        return yield* myResource;
      });
      expect(result.status).toEqual('finalized');
    });
  });
});
