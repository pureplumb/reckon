import type { Household, HouseholdSlice } from "./types";
import type { YearRef } from "../timeline/types";

/**
 * Each person's birth year, keyed by id: the plain shape other topics take
 * (flows), so they don't import the Household type. {} with no household.
 */
export const birthYearsOf = (household?: Household): Record<string, number> =>
    Object.fromEntries(
        (household?.people ?? []).map((p) => [p.id, p.birthYear]),
    );

/**
 * Each person's age in year `y` (calendarYear - birthYear), keyed by id.
 * `ages` is {} with no household.
 */
export const agesFor = (
    household: Household | undefined,
    y: YearRef,
): HouseholdSlice => ({
    ages: Object.fromEntries(
        (household?.people ?? []).map((p) => [p.id, y.calendarYear - p.birthYear]),
    ),
});
