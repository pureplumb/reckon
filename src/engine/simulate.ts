import { inflationFactor } from "../core/growth";
import type { ProjectionInput } from "./input";
import type { ProjectionResult, ProjectionYear } from "./result";

/** The year-by-year balance loop. Expects validated input. */
export const simulate = (input: ProjectionInput): ProjectionResult => {
    const startBalance = input.portfolio.startBalance;
    const returnRate = input.assumptions.returnRate;
    const inflationRate = input.assumptions.inflationRate;
    const spending = input.spending.annual;
    const startYear = input.timeline.startYear;

    let balance = startBalance;
    let totalWithdrawn = 0;
    let totalShortfall = 0;
    let depletedInYear: number | null = null;

    const years: ProjectionYear[] = [];

    // Keep looping after depletion: every year gets a row, and later years
    // record the unfunded spending as shortfall.
    for (let year = 1; year <= input.timeline.years; year++) {
        // Year 1 uses the withdrawal as given; inflation adjustments start in year 2.
        const target = spending * inflationFactor(inflationRate, year - 1);
        const withdrawal = Math.min(target, balance);
        const shortfall = target - withdrawal;
        const afterDraw = balance - withdrawal;
        const growth = afterDraw * returnRate;
        const endBalance = afterDraw + growth;

        totalWithdrawn += withdrawal;
        totalShortfall += shortfall;
        if (depletedInYear === null && endBalance <= 0) depletedInYear = year;

        years.push({
            year,
            calendarYear: startYear + year - 1,
            startBalance: balance,
            withdrawal,
            shortfall,
            growth,
            endBalance,
            endBalanceReal: endBalance / inflationFactor(inflationRate, year),
        });
        balance = endBalance;
    }

    return {
        years,
        summary: {
            endBalance: balance,
            endBalanceReal: balance /
                inflationFactor(inflationRate, input.timeline.years),
            totalWithdrawn,
            totalShortfall,
            depletedInYear,
        },
    };
};
