import type { ProjectionSummary, ProjectionYear } from "./result";

/**
 * Summarize the simulation results
 * @param years
 * @returns
 */
export const summarize = (years: ProjectionYear[]): ProjectionSummary => {
    const last = years.at(-1)!;
    const total = (f: (y: ProjectionYear) => number) =>
        years.reduce((t, y) => t + f(y), 0);
    return {
        endBalance: last.endBalance,
        endBalanceReal: last.endBalanceReal,
        totalWithdrawn: total((y) => y.withdrawal),
        totalShortfall: total((y) => y.shortfall),
        totalIncome: total((y) => y.income),
        totalContributions: total((y) => y.contributions),
        firstShortfallYear: years.find((y) => y.shortfall > 0)?.year ?? null,
    };
};
