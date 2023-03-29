import type { Result } from "./types.ts";

export function Ok<T>(value: T): Result<T> {
  return {
    ok: true,
    value,
  };
}

export function Err(error: Error): Result<never> {
  return {
    ok: false,
    error,
  };
}
