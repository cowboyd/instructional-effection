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
  type: "suspend";
  then?(): void;
};

export interface Future<T> extends Promise<T>, Operation<T> {}

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}
