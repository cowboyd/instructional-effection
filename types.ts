// deno-lint-ignore-file no-explicit-any
import type { Computation } from "./deps.ts";

export interface Operation<T> {
  [Symbol.iterator](): Iterator<Instruction, T, any>;
}

export interface Future<T> extends Promise<T>, Operation<T> {}

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

export type Resolve<T = unknown> = (value: T) => void;

export type Reject = (error: Error) => void;

export type Provide<T> = (value: T) => Operation<void>;

export interface Scope extends Operation<void> {
  run<T>(operation: () => Operation<T>): Task<T>;
  close(): Future<void>;
}

export type Subscription<T, R> = Operation<IteratorResult<T, R>>;

export type Stream<T, TReturn> = Operation<Subscription<T, TReturn>>;

export interface Port<T, R> {
  send(message: T): Operation<void>;
  close(value: R): Operation<void>;
}

export interface Channel<T, TClose> {
  input: Port<T, TClose>;
  output: Stream<T, TClose>;
}

/* low-level interface Which you probably will not need */

export type Result<T> =
  | { type: "resolved"; value: T }
  | { type: "rejected"; error: Error };

export interface Instruction {
  (frame: Frame, signal: AbortSignal): Computation<Result<unknown>>;
}

export interface Observer<TEvent> extends Computation<TEvent> {
  drop(): void;
}

export interface Frame extends Computation<Result<void>> {
  id: number;
  context: Record<string, unknown>;
  createChild(): Frame;
  run<T>(operation: () => Operation<T>): Block<T>;
  crash(error: Error): Computation<Result<void>>;
  destroy(): Computation<Result<void>>;
}

export type BlockResult<T> = Result<T> | {
  type: "aborted";
  result: Result<void>;
};

export interface Block<T = unknown> extends Computation<BlockResult<T>> {
  name: string;
  enter(): void;
  abort(): Computation<Result<void>>;
}
