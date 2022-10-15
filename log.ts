import type { Channel, Operation } from "./types.ts";
import { createContext } from "./context.ts";
import { createChannel } from "./channel.ts";

export const LogContext = createContext<Channel<LogMessage, void>>(
  "log",
  createChannel<LogMessage, void>(),
);

export function* info(message: string): Operation<void> {
  let { input } = yield* LogContext;
  yield* input.send({ message, level: "info" });
}

export function log(message: string): Operation<void> {
  return info(message);
}

export interface LogMessage {
  level: string;
  message: string;
}
