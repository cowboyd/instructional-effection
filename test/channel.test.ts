import {
  afterEach as $afterEach,
  beforeEach as $beforeEach,
  describe,
  expect,
  it as $it,
} from "./suite.ts";

import type { Operation, Port, Stream } from "../mod.ts";
import { createChannel, createScope, sleep, spawn } from "../mod.ts";

let scope = createScope();
describe("Channel", () => {
  $beforeEach(() => {
    scope = createScope();
  });
  $afterEach(() => scope.close());

  describe("subscribe", () => {
    let input: Port<string, void>;
    let output: Stream<string, void>;

    beforeEach(function* () {
      ({ input, output } = createChannel<string, void>());
    });

    describe("sending a message", () => {
      it("receives message on subscription", function* () {
        let subscription = yield* output;
        yield* input.send("hello");
        let result = yield* subscription;
        expect(result.done).toEqual(false);
        expect(result.value).toEqual("hello");
      });
    });

    describe("blocking on next", () => {
      it("receives message on subscription done", function* () {
        let subscription = yield* output;
        let result = yield* spawn(() => subscription);
        yield* sleep(10);
        yield* input.send("hello");
        expect(yield* result).toHaveProperty("value", "hello");
      });
    });

    describe("sending multiple messages", () => {
      it("receives messages in order", function* () {
        let subscription = yield* output;
        let { send } = input;
        yield* send("hello");
        yield* send("foo");
        yield* send("bar");
        expect(yield* subscription).toHaveProperty("value", "hello");
        expect(yield* subscription).toHaveProperty("value", "foo");
        expect(yield* subscription).toHaveProperty("value", "bar");
      });
    });

    describe("with split ends", () => {
      it("receives message on subscribable end", function* () {
        let { input, output } = createChannel();

        let subscription = yield* output;

        yield* input.send("hello");

        expect(yield* subscription).toEqual({
          done: false,
          value: "hello",
        });
      });
    });

    describe("close", () => {
      describe("without argument", () => {
        it("closes subscriptions", function* () {
          let { input, output } = createChannel();
          let subscription = yield* output;
          yield* input.send("foo");
          yield* input.close();
          expect(yield* subscription).toEqual({
            done: false,
            value: "foo",
          });
          expect(yield* subscription).toEqual({
            done: true,
            value: undefined,
          });
        });
      });

      describe("with close argument", () => {
        it("closes subscriptions with the argument", function* () {
          let { input, output } = createChannel<string, number>();
          let subscription = yield* output;
          yield* input.send("foo");
          yield* input.close(12);

          expect(yield* subscription).toEqual({
            done: false,
            value: "foo",
          });
          expect(yield* subscription).toEqual({ done: true, value: 12 });
        });
      });
    });
  });
});

function beforeEach(op: () => Operation<void>): void {
  $beforeEach(() => scope.run(op));
}

function it(desc: string, op: () => Operation<void>): void {
  $it(desc, () => scope.run(op));
}
