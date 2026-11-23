import { checkRange, LIMITS } from "./validate";

export interface ProjectionInput {
    startBalance: number; // > 0
    returnRate: number; // nominal annual return, e.g. 0.05
    inflationRate: number; // annual, e.g. 0.03
    annualWithdrawal: number; // year-1 amount in today's dollars, >= 0
    years: number; // integer >= 1
    startYear: number; // calendar year of year 1, for labelling
}

/**
 * Validate input
 * @param i
 */
const validateProjectionInput = (i: ProjectionInput): void => {
    checkRange(
        Number.isFinite(i.startBalance) && i.startBalance > 0,
        `startBalance must be > 0, got ${i.startBalance}`,
    );
    checkRange(
        Number.isFinite(i.returnRate) && i.returnRate > LIMITS.rate.min &&
            i.returnRate <= LIMITS.rate.max,
        `returnRate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got ${i.returnRate}`,
    );
    checkRange(
        Number.isFinite(i.inflationRate) && i.inflationRate > LIMITS.rate.min &&
            i.inflationRate <= LIMITS.rate.max,
        `inflationRate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got ${i.inflationRate}`,
    );
    checkRange(
        Number.isFinite(i.annualWithdrawal) && i.annualWithdrawal >= 0,
        `annualWithdrawal must be >= 0, got ${i.annualWithdrawal}`,
    );
    checkRange(
        Number.isInteger(i.years) && i.years >= LIMITS.years.min &&
            i.years <= LIMITS.years.max,
        `years must be a whole number in the range 1-150, got ${i.years}`,
    );
    checkRange(
        Number.isInteger(i.startYear),
        `startYear must be a whole number, got ${i.startYear}`,
    );
};

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

/** Cumulative inflation factor after `years` years: (1 + rate)^years. */
const inflationFactor = (rate: number, years: number): number =>
    (1 + rate) ** years;

export const projectPortfolio = (input: ProjectionInput): ProjectionResult => {
    validateProjectionInput(input);

    const {
        startBalance,
        returnRate,
        inflationRate,
        annualWithdrawal,
        startYear,
    } = input;

    let balance = startBalance;
    let totalWithdrawn = 0;
    let totalShortfall = 0;
    let depletedInYear: number | null = null;
    const years: ProjectionYear[] = [];

    // Keep looping after depletion: every year gets a row, and later years
    // record the unfunded spending as shortfall.
    for (let year = 1; year <= input.years; year++) {
        // Year 1 uses the withdrawal as given; inflation adjustments start in year 2.
        const target = annualWithdrawal *
            inflationFactor(inflationRate, year - 1);
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
                inflationFactor(inflationRate, input.years),
            totalWithdrawn,
            totalShortfall,
            depletedInYear,
        },
    };
};
