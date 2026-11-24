import { checkRange } from "../../core/check";
import { LIMITS } from "../../core/limits";
import type { Assumptions } from "./types";

const isRate = (v: number) =>
    Number.isFinite(v) && v > LIMITS.rate.min && v <= LIMITS.rate.max;

export const validateAssumptions = (a: Assumptions): void => {
    checkRange(
        isRate(a.returnRate),
        `assumptions.returnRate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got ${a.returnRate}`,
    );
    checkRange(
        isRate(a.inflationRate),
        `assumptions.inflationRate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got ${a.inflationRate}`,
    );
};
