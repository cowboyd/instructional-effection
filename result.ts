import type { ErrResult, OkResult } from "./types.ts";

export function Ok<T>(value: T): OkResult<T> {
  return {
    type: "resolved",
    ok: true,
    value,
  };
}

export function Err(error: Error): ErrResult {
  return {
    type: "rejected",
    ok: false,
    error,
  };
}
