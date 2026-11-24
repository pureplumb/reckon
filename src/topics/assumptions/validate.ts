import { checkRange, isRate, RATE_RULE } from "../../core/check";
import type { Assumptions } from "./types";

export const validateAssumptions = (a: Assumptions): void => {
    checkRange(
        isRate(a.returnRate),
        `assumptions.returnRate ${RATE_RULE}, got ${a.returnRate}`,
    );
    checkRange(
        isRate(a.inflationRate),
        `assumptions.inflationRate ${RATE_RULE}, got ${a.inflationRate}`,
    );
};
