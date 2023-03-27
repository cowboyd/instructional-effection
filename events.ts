import type { Operation, Stream } from "./types.ts";
import { action, resource, suspend } from "./instructions.ts";
import { createChannel } from "./channel.ts";
import { useScope } from "./run/scope.ts";


type EventMap<T extends EventTarget> =
  T extends WebSocket ? WebSocketEventMap
  : T extends MediaQueryList
  ? MediaQueryListEventMap
  : T extends Document
  ? DocumentEventMap
  : T extends Window
  ? WindowEventMap
  : HTMLElementEventMap;

type EventTypes<T extends EventTarget> = keyof EventMap<T> & string;
type EventValue<T extends EventTarget, K extends EventTypes<T>> = Extract<EventMap<T>[K], Event>;

type FN = (...any: any[]) => any;

type EventTypeFromListener<T extends FN> = T extends (
  this: any,
  event: infer U
) => any
  ? U extends Event
  ? U
  : Event
  : Event;

type EventTypeFromEventTarget<
  T extends EventTarget,
  K extends string
> = T extends unknown
  ? `on${K}` extends keyof T
  ? EventTypeFromListener<
    Extract<T[`on${K}`], FN>
  >
  : Event
  : never;

type EventList<
  T extends EventTarget,
  K = keyof T
> = K extends `on${infer U}`
? U : never;

type B = EventList<WebSocket>

export function once<T extends EventTarget, K extends EventList<T>>(target: T, name: K): Operation<EventTypeFromEventTarget<T, K>> {
  return action(function* (resolve) {
    target.addEventListener(name, resolve as EventListenerOrEventListenerObject);
    try {
      yield* suspend();
    } finally {
      target.removeEventListener(name, resolve as EventListenerOrEventListenerObject);
    }
  });
}

export function on<T extends EventTarget, K extends EventList<T>>(target: T, name: K): Stream<EventTypeFromEventTarget<T, K>, never> {
  return resource(function* (provide) {
    let { input, output } = createChannel<Event, never>();
    let scope = yield* useScope();
    let listener = (event: Event) => scope.run(() => input.send(event));

    target.addEventListener(name, listener);

    try {
      yield* provide(yield* output as Stream<EventTypeFromEventTarget<T, K>, never>);
    } finally {
      target.removeEventListener(name, listener);
    }
  });
}
