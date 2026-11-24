import { checkRange } from "../../core/check";
import { LIMITS } from "../../core/limits";
import type { Timeline } from "./types";

export const validateTimeline = (t: Timeline): void => {
    checkRange(
        Number.isInteger(t.years) && t.years >= LIMITS.years.min &&
            t.years <= LIMITS.years.max,
        `timeline.years must be a whole number in the range 1-150, got ${t.years}`,
    );
    checkRange(
        Number.isInteger(t.startYear),
        `timeline.startYear must be a whole number, got ${t.startYear}`,
    );
};
