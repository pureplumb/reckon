/** Numeric limits enforced by validation, exported so clients can reuse them. */
export const LIMITS = {
    rate: { min: -1, max: 1 }, // min is exclusive
    years: { min: 1, max: 150 },
    age: { min: 0, max: 120 },
} as const;
