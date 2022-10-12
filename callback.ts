import type { Operation } from "./types.ts";
import { action, suspend } from "./instructions.ts";

export interface Once<T> extends Operation<T> {
  (value: T): void;
}

export function callback<T>(): Once<T> {
  let result: { called: false } | { called: true; value: T } = {
    called: false,
  };

  let listeners = new Set<(value: T) => void>();

  let callback = (value: T) => {
    if (!result.called) {
      result = { called: true, value };
      for (let listener of listeners) {
        listener(value);
      }
    }
  };

  return Object.assign(callback, {
    *[Symbol.iterator]() {
      if (result.called) {
        return result.value;
      } else {
        return yield* action<T>(function* (resolve) {
          try {
            listeners.add(resolve);
            yield* suspend();
          } finally {
            listeners.delete(resolve);
          }
        });
      }
    },
  }) as Once<T>;
}
