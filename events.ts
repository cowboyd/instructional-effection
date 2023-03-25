import type { Operation, Stream } from "./types.ts";
import { action, resource, suspend } from "./instructions.ts";
import { createChannel } from "./channel.ts";
import { useScope } from "./run/scope.ts";


type EventMap<T extends EventTarget> = T extends WebSocket ? WebSocketEventMap
  : T extends MediaQueryList
  ? MediaQueryListEventMap
  : T extends Document
  ? DocumentEventMap
  : T extends Window
  ? WindowEventMap
  : HTMLElementEventMap;

type EventTypes<T extends EventTarget> = keyof EventMap<T> & string;
type EventValue<T extends EventTarget, K extends EventTypes<T>> = Extract<EventMap<T>[K], Event>;

type O = EventValue<HTMLButtonElement, 'click'>; // MouseEvent

export function once<T extends EventTarget, K extends EventTypes<T>>(target: T, name: K): Operation<EventValue<T, K>> {
  return action(function* (resolve) {
    target.addEventListener(name, resolve as EventListenerOrEventListenerObject);
    try {
      yield* suspend();
    } finally {
      target.removeEventListener(name, resolve as EventListenerOrEventListenerObject);
    }
  });
}

export function on<T extends EventTarget, K extends EventTypes<T>>(target: T, name: K): Stream<EventValue<T, K>, never> {
  return resource(function* (provide) {
    let { input, output } = createChannel<Event, never>();
    let scope = yield* useScope();
    let listener = (event: Event) => scope.run(() => input.send(event));

    target.addEventListener(name, listener);

    try {
      yield* provide(yield* output as Stream<EventValue<T, K>, never>);
    } finally {
      target.removeEventListener(name, listener);
    }
  });
}


let socket = new WebSocket("wss://localhost:8000");

socket.addEventListener("close", (event) => { event });

let closes = once(socket, "close");  //=> Operation<CloseEvent>
let messages = on(socket, "message"); //=> Stream<MessageEvent<any>, never>