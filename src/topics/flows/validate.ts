import { checkRange, isRate, RATE_RULE } from "../../core/check";
import type { Timeline } from "../timeline/types";
import type { CashFlow } from "./types";

/**
 * Checks each flow (design/validation.md#rules). Takes the timeline as an
 * argument for the year checks, so it must run after validateTimeline.
 */
export const validateFlows = (flows: CashFlow[], timeline: Timeline): void => {
    const seen = new Map<string, number>();
    flows.forEach((f, i) => {
        const path = `flows[${i}]`;

        checkRange(
            typeof f.id === "string" && f.id.length > 0,
            `${path}.id must be a non-empty string, got ${JSON.stringify(f.id)}`,
        );
        const first = seen.get(f.id);
        checkRange(
            first === undefined,
            `${path}.id must be unique, got ${JSON.stringify(f.id)} (also flows[${first}].id)`,
        );
        seen.set(f.id, i);

        checkRange(
            Number.isFinite(f.amount) && f.amount >= 0,
            `${path}.amount must be >= 0, got ${f.amount}`,
        );

        for (const field of ["fromYear", "toYear"] as const) {
            const v = f[field];
            if (v === undefined) continue;
            checkRange(
                Number.isInteger(v) && v >= timeline.startYear,
                `${path}.${field} must be a whole number >= timeline.startYear (${timeline.startYear}), got ${v}`,
            );
        }
        if (f.fromYear !== undefined && f.toYear !== undefined) {
            checkRange(
                f.fromYear <= f.toYear,
                `${path}.toYear must be >= fromYear (${f.fromYear}), got ${f.toYear}`,
            );
        }

        if (typeof f.indexing === "object") {
            checkRange(
                isRate(f.indexing.rate),
                `${path}.indexing.rate ${RATE_RULE}, got ${f.indexing.rate}`,
            );
        }
    });
};
