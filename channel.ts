import type {
  Channel,
  Resolve,
  Result,
  Stream,
  Subscription,
} from "./types.ts";
import { action, resource, suspend } from "./instructions.ts";
import { shift } from "./deps.ts";

export function createChannel<T, TClose>(): Channel<T, TClose> {
  let subscribers = new Set<ChannelSubscriber<T, TClose>>();

  let output: Stream<T, TClose> = {
    [Symbol.iterator]: () =>
      resource<Subscription<T, TClose>>(function* (provide) {
        let subscriber: ChannelSubscriber<T, TClose> = {
          notify() {},
        };

        let subscription: Subscription<T, TClose> = {
          [Symbol.iterator]: () =>
            action<IteratorResult<T, TClose>>(function* (resolve) {
              subscriber.notify = resolve;
              yield* suspend();
            })[Symbol.iterator](),
        };
        subscribers.add(subscriber);
        try {
          yield* provide(subscription);
        } finally {
          subscribers.delete(subscriber);
        }
      })[Symbol.iterator](),
  };

  let send = (item: IteratorResult<T, TClose>) => {
    return {
      *[Symbol.iterator]() {
        yield () =>
          shift<Result<void>>(function* (k) {
            let result: Result<void> = { type: "resolved", value: void 0 };
            for (let subscriber of subscribers) {
              try {
                subscriber.notify(item);
              } catch (error) {
                result = { type: "rejected", error };
              }
            }
            k(result);
          });
      },
    };
  };

  let input = {
    send: (value: T) => send({ done: false, value }),
    close: (value: TClose) => send({ done: true, value }),
  };

  return { input, output };
}

interface ChannelSubscriber<T, TClose> {
  notify: Resolve<IteratorResult<T, TClose>>;
}
