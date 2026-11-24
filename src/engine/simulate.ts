import type { Assumptions } from "../topics/assumptions/types";
import { inflationFactor } from "../core/growth";
import { type SimState, totalBalance } from "../core/state";
import { depositContributions, reinvest } from "../topics/flows/steps";
import { grow, initialState } from "../topics/portfolio/steps";
import { withdrawForSpending } from "../topics/spending/steps";
import type { ProjectionInput } from "./input";
import type { ProjectionResult, ProjectionYear } from "./result";
import type { ScheduleYear } from "./schedule";
import { summarize } from "./summarize";

/**
 * Runs one year's steps in the fixed order (architecture.md §3) and builds the
 * row. Changes `state` in place.
 */
export const simulateYear = (
    state: SimState,
    s: ScheduleYear,
    assumptions: Assumptions,
): ProjectionYear => {
    const startBalance = totalBalance(state);

    // 1. flows: contributions land first, so they can fund this year's spending
    depositContributions(state, s.contributions);

    // 2. RMDs arrive in stage 6

    // 3. spending: net against income, withdraw the rest
    const { withdrawal, shortfall, surplus } = withdrawForSpending(
        state,
        s.spending,
        s.income,
    );

    // 4. flows: reinvest income above spending (Decision 2)
    reinvest(state, surplus);

    // 5. portfolio: grow what's left
    const growth = grow(state, assumptions.returnRate);

    const endBalance = totalBalance(state);

    return {
        ...s, // year, calendarYear, spending, income, contributions, flows
        startBalance,
        withdrawal,
        shortfall,
        surplus,
        growth,
        endBalance,
        endBalanceReal: endBalance /
            inflationFactor(assumptions.inflationRate, s.year),
    };
};

/**
 * The year-by-year balance loop over a built schedule. Expects validated
 * input. The state is created here and shared with nothing, so this is pure
 * from the outside.
 */
export const simulate = (
    input: ProjectionInput,
    schedule: ScheduleYear[],
): ProjectionResult => {
    const state = initialState(input.portfolio);
    const years = schedule.map((s) =>
        simulateYear(state, s, input.assumptions)
    );
    return { years, summary: summarize(years) };
};
