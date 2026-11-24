/** Throws a RangeError with `message` if `cond` is falsy. */
export function checkRange(cond: unknown, message: string): asserts cond {
    if (!cond) throw new RangeError(message);
}
