export * from "https://deno.land/std@0.163.0/testing/bdd.ts";
export { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";

import { Operation, sleep } from "../mod.ts";

export function* createNumber(value: number): Operation<number> {
  yield* sleep(1);
  return value;
}

export function* blowUp<T>(): Operation<T> {
  yield* sleep(1);
  throw new Error("boom");
}
