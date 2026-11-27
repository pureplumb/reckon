import { checkRange, isRate, RATE_RULE } from "../../core/check";
import { LIMITS } from "../../core/limits";
import type { Timeline } from "../timeline/types";
import type { CashFlow } from "./types";

/**
 * Checks each flow (design/validation.md#rules). Takes the timeline for the
 * year checks and the household's birth years, keyed by person id, for the
 * person and age checks ({} with no household), so it must run after
 * validateTimeline and validateHousehold.
 */
export const validateFlows = (
    flows: CashFlow[],
    timeline: Timeline,
    birthYears: Record<string, number> = {},
): void => {
    const peopleCount = Object.keys(birthYears).length;
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

        if (f.person !== undefined) {
            checkRange(
                Object.hasOwn(birthYears, f.person),
                `${path}.person must name a person in household.people, got ${JSON.stringify(f.person)}`,
            );
        }

        for (const [age, year] of [["fromAge", "fromYear"], ["toAge", "toYear"]] as const) {
            const v = f[age];
            if (v === undefined) continue;
            checkRange(
                Number.isInteger(v) && v >= LIMITS.age.min && v <= LIMITS.age.max,
                `${path}.${age} must be a whole number from ${LIMITS.age.min} to ${LIMITS.age.max}, got ${v}`,
            );
            checkRange(
                f[year] === undefined,
                `${path}.${age} must not be given with ${year} (${f[year]}), got ${v}`,
            );
            // Decision 4: with one person, `person` defaults to them.
            checkRange(
                f.person !== undefined || peopleCount === 1,
                peopleCount === 0
                    ? `${path}.${age} needs a household, got ${v}`
                    : `${path}.${age} needs person when the household has ${peopleCount} people, got ${v}`,
            );
        }
        if (f.fromAge !== undefined && f.toAge !== undefined) {
            checkRange(
                f.fromAge <= f.toAge,
                `${path}.toAge must be >= fromAge (${f.fromAge}), got ${f.toAge}`,
            );
        }

        // Mixed ranges: compare as calendar years, using birthYear + age. The
        // checks above guarantee `who` names a person when an age is given.
        const who = f.person ?? Object.keys(birthYears)[0]!;
        if (f.fromAge !== undefined && f.toYear !== undefined) {
            const from = birthYears[who]! + f.fromAge;
            checkRange(
                from <= f.toYear,
                `${path}.toYear must be >= the year ${who} reaches fromAge (${from}, age ${f.fromAge}), got ${f.toYear}`,
            );
        }
        if (f.fromYear !== undefined && f.toAge !== undefined) {
            const ageThen = f.fromYear - birthYears[who]!;
            checkRange(
                ageThen <= f.toAge,
                `${path}.toAge must be >= ${who}'s age in fromYear (${ageThen} in ${f.fromYear}), got ${f.toAge}`,
            );
        }
        // Like toYear >= startYear: a flow that ends before the projection
        // never runs. (A past fromAge is fine: the flow is active from year 1.)
        if (f.toAge !== undefined) {
            const ageAtStart = timeline.startYear - birthYears[who]!;
            checkRange(
                f.toAge >= ageAtStart,
                `${path}.toAge must be >= ${who}'s age at timeline.startYear (${ageAtStart}), got ${f.toAge}`,
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
