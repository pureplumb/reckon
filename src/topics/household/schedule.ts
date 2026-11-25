import type { Household, HouseholdSlice } from "./types";
import type { YearRef } from "../timeline/types";

/**
 * Used as part of building the ScheduleYear.
 * @param household
 * @param y
 * @returns Record of [person, age]
 */
export const agesFor = (household: Household, y: YearRef): HouseholdSlice => ({
    ages: Object.fromEntries(
        household.people.map((p) => [p.id, y.calendarYear - p.birthYear]),
    ),
});
