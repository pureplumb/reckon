export interface ProjectionYear {
    year: number; // 1-based index
    calendarYear: number; // startYear + year - 1
    startBalance: number;
    withdrawal: number; // actual amount taken (capped at available balance)
    shortfall: number; // spending the portfolio couldn't cover: target - withdrawal
    growth: number; // investment return earned this year
    endBalance: number; // nominal
    endBalanceReal: number; // in year-0 dollars: endBalance / (1 + inflation)^year
}

export interface ProjectionResult {
    years: ProjectionYear[];
    summary: {
        endBalance: number;
        endBalanceReal: number;
        totalWithdrawn: number;
        totalShortfall: number; // sum of shortfall across all years
        depletedInYear: number | null; // first year the balance hit 0, else null
    };
}
