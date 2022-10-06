import { Computation, evaluate, reset, shift } from './deps.ts';

interface Reducer<Cx, T> {
  (context: Cx, k: (next: IteratorResult<Cx, T>) => void): Computation<void>;
}

export function* reduce<Cx, T>(initial: Cx, reducer: Reducer<Cx,T>) {
  let current = initial;
  while (true) {
    let next = yield* shift<IteratorResult<Cx, T>, void>(function*(k) {
      yield* reducer(current, k)
    });
    if (next.done) {
      return next.value;
    } else {
      current = next.value;
    }
  }
}

// part of the magic, is that the loop is the same whethere summing integers, or
// computing highly async ops.

evaluate(function*() {
  let cxt = {
    sum: 0,
    rest: [1,3,5,9,0],
  };

  let sum = yield* reduce(cxt, function*(current, next) {
    yield* shift(function*(k) {
      setTimeout(k, 200);
    });
    console.dir({ current });
    if (current.rest.length === 0) {
      next({ done: true, value: current.sum })
    } else {
      let [first, ...rest] = current.rest;
      next({
        done: false,
        value: {
          sum: current.sum + first,
          rest,
        }
      });
    }
  });

  console.dir({ sum });
})
