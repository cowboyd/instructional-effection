import { Handler, serve } from "https://deno.land/std@0.159.0/http/mod.ts";
import { signal } from "https://deno.land/std@0.159.0/signal/mod.ts";

import {
  callback,
  first,
  Operation,
  resource,
  run,
  stream,
  useAbortSignal,
} from "../mod.ts";

export interface Server {
  hostname: string;
  port: number;
}

const echo: Handler = async function (request) {
  let text = await request.text();
  return new Response(text);
};

export function useEchoServer(port: number): Operation<Server> {
  return resource(function* Server(provide) {
    let signal = yield* useAbortSignal();

    let onListen = callback<Server>();

    serve(echo, { port, signal, onListen });

    let server = yield* onListen;

    yield* provide(server);
  });
}

export function* awaitSignal(name: Deno.Signal): Operation<void> {
  let signals = signal(name);
  try {
    yield* first(stream(signals));
  } finally {
    signals.dispose();
  }
}

await run(function* () {
  let server = yield* useEchoServer(5000);

  console.log(`server listening on ${server.hostname}:${server.port}`);

  yield* awaitSignal("SIGINT");
});
