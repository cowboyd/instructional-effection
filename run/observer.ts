import type { Resolve, Observer } from "../types.ts";

import { shift } from "../deps.ts";

export function createObservable<T>()  {
  let observers = new Map<Observer<T>, Resolve<T>>();

  return {
    notify(value: T) {
      for (let listener of observers.values()) {
        listener(value);
      }
    },
    observe(): Observer<T> {
      let observer = {
        *[Symbol.iterator]() {
          return yield* shift<T>(function*(k) {
            observers.set(observer, k);
          });
        },
        drop() {
          observers.delete(observer);
        }
      };
      return observer;
    },
  }
}
