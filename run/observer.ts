import type { Observer, Resolve } from "../types.ts";

import { Computation, shift } from "../deps.ts";

export function createObservable<T>() {
  let observers = new Map<Observer<T>, Resolve<T>>();

  let observable = {
    notify(value: T) {
      let handlers = [...observers.values()];
      for (let handler of handlers) {
        handler(value);
      }
    },
    *first(): Computation<T> {
      return yield* shift<T>(function* (k) {
        let observer = observable.observe();
        let value = yield* observer;
        observer.drop();
        k(value);
      });
    },
    observe(): Observer<T> {
      let events: T[] = [];
      let consumers: Resolve<T>[] = [];
      let observer = {
        *[Symbol.iterator]() {
          let event = events.pop();
          if (event) {
            return event;
          } else {
            return yield* shift<T>(function* (k) {
              consumers.unshift(k);
            });
          }
        },
        drop() {
          observers.delete(observer);
        },
      };
      observers.set(observer, (event: T) => {
        events.unshift(event);
        while (events.length > 0 && consumers.length > 0) {
          let consume = consumers.pop() as Resolve<T>;
          let event = events.pop() as T;
          consume(event);
        }
      });
      return observer;
    },
  };
  return observable;
}
