import { expectType } from '../deps.ts';
import { on, once } from "../events.ts";
import { Operation, Stream } from "../types.ts";
import { describe, expect, it } from "./suite.ts";


describe('events', () => {
  const domElement = {} as HTMLElement;
  let socket = {} as WebSocket;
  it('should find event from eventTarget', () => {
    expectType<Operation<CloseEvent>>(once(socket, "close"));
    expectType<Stream<MessageEvent<any>, never>>(on(socket, "message"));
    
    expectType<Operation<MouseEvent>>(once(domElement, "click"));
  });

  it("should fall back to event", () => {
    expectType<Operation<Event>>(once<HTMLElement, any>(domElement, "mycustomevent"));
  });
});