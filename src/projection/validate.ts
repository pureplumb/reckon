export const LIMITS = {
    rate: { min: -1, max: 1 },
    years: { min: 1, max: 150 },
} as const;

export function checkRange(cond: unknown, message: string): asserts cond {
    if (!cond) throw RangeError(message);
}
