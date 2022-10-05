// deno-lint-ignore-file no-explicit-any
export interface Operation<T> {
  [Symbol.iterator](): Iterator<Instruction<any>, T, any>;
}

export interface Continuation<T = any, R = void> {
  (value: T): R;
}

export type Provide<T> = (value: T) => Operation<void>;

export type Instruction<T = any> = {
  type: "resource";
  operation(provide: Provide<T>): Operation<T>;
} | {
  type: "action";
  operation(
    resolve: Continuation<T>,
    reject: Continuation<Error>,
  ): Operation<T>;
} | {
  type: "suspend";
};

export interface Future<T> extends Promise<T>, Operation<T> {}

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}
