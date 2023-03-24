import type { Operation, Stream } from "./types.ts";
import { action, resource, suspend } from "./instructions.ts";
import { createChannel } from "./channel.ts";
import { useScope } from "./run/scope.ts";

export function once(target: EventTarget, name: string): Operation<Event> {
  return action(function* (resolve) {
    target.addEventListener(name, resolve);
    try {
      yield* suspend();
    } finally {
      target.removeEventListener(name, resolve);
    }
  });
}

export function on(target: EventTarget, name: string): Stream<Event, never> {
  return resource(function* (provide) {
    let { input, output } = createChannel<Event, never>();
    let scope = yield* useScope();
    let listener = (event: Event) => scope.run(() => input.send(event));

    target.addEventListener(name, listener);

    try {
      yield* provide(yield* output);
    } finally {
      target.removeEventListener(name, listener);
    }
  });
}

let socket = new WebSocket("wss://localhost:8000");

socket.addEventListener("message", (event) => { event });
socket.addEventListener("close", (event) => { event });

let messages = on(socket, "message"); //=> Stream<MessageEvent<any>, never>
let closes = once(socket, "close");  //=> Operation<CloseEvent>
