import type { FlowsSlice } from "../topics/flows/types";
import type { HouseholdSlice } from "../topics/household/types";
import type { SpendingSlice } from "../topics/spending/types";
import type { YearRef } from "../topics/timeline/types";
import type { ProjectionInput } from "./input";

import { flowForYear } from "../topics/flows/schedule";
import { agesFor, birthYearsOf } from "../topics/household/schedule";
import { spendingFor } from "../topics/spending/schedule";
import { projectionYears } from "../topics/timeline/schedule";

export type ScheduleYear =
    & YearRef
    & SpendingSlice
    & FlowsSlice
    & HouseholdSlice;

export const buildSchedule = (input: ProjectionInput): ScheduleYear[] => {
    const birthYears = birthYearsOf(input.household); // {} when there's no household

    return projectionYears(input.timeline).map((yref) => ({
        ...yref,
        ...spendingFor(input.spending, input.assumptions.inflationRate, yref),
        ...flowForYear(
            input.flows ?? [],
            yref,
            input.timeline,
            input.assumptions.inflationRate,
            birthYears,
        ),
        ...agesFor(input.household, yref),
    }));
};
