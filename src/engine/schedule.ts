import type { FlowsSlice } from "../topics/flows/types";
import type { SpendingSlice } from "../topics/spending/types";
import type { YearRef } from "../topics/timeline/types";
import type { ProjectionInput } from "./input";
import type { HouseholdSlice } from "@/topics/household/types";

import { projectionYears } from "../topics/timeline/schedule";
import { spendingFor } from "../topics/spending/schedule";
import { flowForYear } from "../topics/flows/schedule";

export type ScheduleYear =
    & YearRef
    & SpendingSlice
    & FlowsSlice
    & HouseholdSlice;

export const buildSchedule = (input: ProjectionInput): ScheduleYear[] => {
    return projectionYears(input.timeline).map((yref) => ({
        ...yref,
        ...spendingFor(input.spending, input.assumptions, yref),
        ...flowForYear(
            input.flows ?? [],
            yref,
            input.timeline,
            input.assumptions.inflationRate,
        ),
        // agesFor()
    }));
};
