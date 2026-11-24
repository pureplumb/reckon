import type { ScheduleYear } from "./schedule";

export interface ProjectionYear extends ScheduleYear {
    startBalance: number;
    withdrawal: number; // actual amount taken (capped at available balance)
    shortfall: number; // spending the portfolio couldn't cover: target - withdrawal
    surplus: number; // income above spending, reinvested
    growth: number; // investment return earned this year
    endBalance: number; // nominal
    endBalanceReal: number; // in year-0 dollars: endBalance / (1 + inflation)^year
}

export interface ProjectionSummary {
    endBalance: number;
    endBalanceReal: number;
    totalWithdrawn: number;
    totalShortfall: number;
    totalIncome: number;
    totalContributions: number;
    firstShortfallYear: number | null; // first year with shortfall > 0, else null
}

export interface ProjectionResult {
    years: ProjectionYear[];
    summary: ProjectionSummary;
}
