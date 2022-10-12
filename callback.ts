import type { Operation } from "./types.ts";
import { createFuture } from "./future.ts";

export interface Once<T> extends Operation<T> {
  (value: T): void;
}

export function callback<T>(): Once<T> {

  let { resolve, future } = createFuture<T>();

  let callback = resolve;

  return Object.assign(callback, {
    [Symbol.iterator]: future[Symbol.iterator]
  }) as Once<T>;
}
