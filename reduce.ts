import { Computation, Continuation, shift } from "./deps.ts";

export interface Reducer<Cx, T> {
  (context: Cx, next: Next<Cx, T>): Computation<void>;
}

export type Next<Cx, T> = Continuation<IteratorResult<Cx, T>, void>;

export function* reduce<Cx, T>(
  initial: Cx,
  reducer: Reducer<Cx, T>,
): Computation<T> {
  let current = initial;

  while (true) {
    let next = yield* shift<IteratorResult<Cx, T>, void>(function* (k) {
      yield* reducer(current, k);
    });
    if (next.done) {
      return next.value;
    } else {
      current = next.value;
    }
  }
}
