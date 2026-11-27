import { checkRange } from "../../core/check";
import { LIMITS } from "../../core/limits";
import type { Household } from "./types";

const { min, max } = LIMITS.age;

/**
 * Checks the household (design/validation.md#rules). Takes
 * `startYear` for the birth-year check, so it must run after validateTimeline.
 */
export const validateHousehold = (
    household: Household,
    startYear: number,
): void => {
    const { people } = household;
    checkRange(
        people.length >= 1 && people.length <= 2,
        `household.people must have 1 or 2 entries, got ${people.length}`,
    );

    const seen = new Map<string, number>();
    people.forEach((p, i) => {
        const path = `household.people[${i}]`;

        checkRange(
            typeof p.id === "string" && p.id.length > 0,
            `${path}.id must be a non-empty string, got ${JSON.stringify(p.id)}`,
        );
        const first = seen.get(p.id);
        checkRange(
            first === undefined,
            `${path}.id must be unique, got ${JSON.stringify(p.id)} (also household.people[${first}].id)`,
        );
        seen.set(p.id, i);

        const age = startYear - p.birthYear;
        checkRange(
            Number.isInteger(p.birthYear) && age >= min && age <= max,
            `${path}.birthYear must be a whole number giving an age at timeline.startYear (${startYear}) from ${min} to ${max}, got ${p.birthYear}`,
        );
    });
};
