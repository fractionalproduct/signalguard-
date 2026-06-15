/**
 * Tiny, dependency-free schema helpers. Just enough to express the structured
 * input/output contracts agents require, without pulling in a runtime schema
 * library. Each returns a Schema<T> (a pure validator function).
 */
import type { Schema, ValidationResult } from "./types.js";

export function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function fail<T>(errors: string[]): ValidationResult<T> {
  return { ok: false, errors };
}

export const stringSchema: Schema<string> = (input) =>
  typeof input === "string" ? ok(input) : fail(["expected string"]);

export const numberSchema: Schema<number> = (input) =>
  typeof input === "number" && Number.isFinite(input)
    ? ok(input)
    : fail(["expected finite number"]);

export const booleanSchema: Schema<boolean> = (input) =>
  typeof input === "boolean" ? ok(input) : fail(["expected boolean"]);

/** Build an object schema from a map of field schemas. Unknown fields are dropped. */
export function objectSchema<T extends Record<string, unknown>>(fields: {
  [K in keyof T]: Schema<T[K]>;
}): Schema<T> {
  return (input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail(["expected object"]);
    }
    const record = input as Record<string, unknown>;
    const out = {} as T;
    const errors: string[] = [];
    for (const key of Object.keys(fields) as (keyof T)[]) {
      const schema = fields[key];
      const result = schema(record[key as string]);
      if (result.ok) {
        out[key] = result.value;
      } else {
        errors.push(...result.errors.map((e) => `${String(key)}: ${e}`));
      }
    }
    return errors.length ? fail(errors) : ok(out);
  };
}

/** Array of items matching `item`. */
export function arraySchema<T>(item: Schema<T>): Schema<T[]> {
  return (input) => {
    if (!Array.isArray(input)) return fail(["expected array"]);
    const out: T[] = [];
    const errors: string[] = [];
    input.forEach((el, i) => {
      const result = item(el);
      if (result.ok) out.push(result.value);
      else errors.push(...result.errors.map((e) => `[${i}]: ${e}`));
    });
    return errors.length ? fail(errors) : ok(out);
  };
}
