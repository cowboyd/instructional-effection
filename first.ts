import type { Operation } from "./types.ts";
import { expect } from "./expect.ts";

export function* first<T>(events: AsyncIterable<T>): Operation<T | undefined> {
  let iterator = events[Symbol.asyncIterator]();
  let next = yield* expect(iterator.next());
  if (!next.done) {
    return next.value;
  } else {
    return void 0;
  }
}
