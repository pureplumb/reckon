import { LIMITS } from "./limits";

/** Throws a RangeError with `message` if `cond` is falsy. */
export function checkRange(cond: unknown, message: string): asserts cond {
    if (!cond) throw new RangeError(message);
}

/** A finite rate within LIMITS.rate: > -1 and <= 1. */
export const isRate = (v: number): boolean =>
    Number.isFinite(v) && v > LIMITS.rate.min && v <= LIMITS.rate.max;

/** Rule text for rates, with the units hint for `5` meaning 5%. */
export const RATE_RULE =
    "must be > -1 and <= 1 (rates are decimals: 0.05 means 5%)";
