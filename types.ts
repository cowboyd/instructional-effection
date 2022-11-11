// deno-lint-ignore-file no-explicit-any
export interface Operation<T> {
  [Symbol.iterator](): Iterator<Instruction<any>, T, any>;
}

export type Resolve<T = unknown> = (value: T) => void;

export type Reject = (error: Error) => void;

export type Provide<T> = (value: T) => Operation<void>;

export type Instruction<T = any> = {
  type: "resource";
  operation(provide: Provide<T>): Operation<T>;
} | {
  type: "action";
  operation(resolve: Resolve<T>, reject: Reject): Operation<void>;
} | {
  type: "spawn";
  operation(): Operation<T>;
} | {
  type: "suspend";
  then?(): void;
} | {
  type: "getframe";
};

export interface Future<T> extends Promise<T>, Operation<T> {}

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
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
