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

export interface Channel<T, R> {
  input: Port<T, R>;
  output: Stream<T, R>;
}

export type Result<T> =
  | { type: "resolved"; value: T }
  | { type: "rejected"; error: Error };

/* low-level interface Which you probably will not need */

export interface Instruction {
  (frame: Frame): Computation<Result<unknown>>;
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

export interface Exited<T> {
  type: "exited";
  reason: "terminated" | "completed";
  result: Result<T>;
}

export interface Exhausted<T> {
  type: "exhausted";
  exit: Exited<T>;
  result: Result<void>;
}

export interface InstructionEvent {
  type: "instruction";
  instruction: Instruction;
}

export type IterationEvent<T> =
  | Exited<T>
  | Exhausted<T>
  | InstructionEvent;

export interface Block<T = unknown> extends Computation<Exhausted<T>> {
  observe(): Observer<IterationEvent<T>>;
  enter(): void;
  abort(): Computation<Result<void>>;
}
