import { checkRange, LIMITS } from "./validate";

export type Indexing = "inflation" | "none" | { rate: number };

export interface FlowBase {
    id: string; // unique; used in per-flow output and error messages
    amount: number; // >= 0, in year-1 (today's) dollars; see Decision 5
    fromYear?: number; // first active calendar year, inclusive; default: startYear; see Decision 6
    toYear?: number; // last active calendar year, inclusive; default: last projection year
}

export interface Contribution extends FlowBase {
    type: "contribution";
    indexing?: Indexing; // default "none"; see Decision 1
}

export interface Income extends FlowBase {
    type: "income";
    source: "pension" | "socialSecurity" | "other";
    indexing: Indexing; // required; see Decision 1
}

export type CashFlow = Contribution | Income;

interface ScheduleYear {
    year: number; // 1-based projection year
    calendarYear: number; // startYear + year - 1
    spending: number; // inflation-adjusted target
    income: number; // sum of active income flows
    contributions: number; // sum of active contribution flows
    flows: Record<string, number>; // each flow's amount, keyed by id
}

export interface ProjectionInput {
    startBalance: number; // > 0
    returnRate: number; // nominal annual return, e.g. 0.05
    inflationRate: number; // annual, e.g. 0.03
    spending: number; // year-1 amount in today's dollars, >= 0
    flows?: CashFlow[];
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
        Number.isFinite(i.spending) && i.spending >= 0,
        `spending must be >= 0, got ${i.spending}`,
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

/**
 * Calculate the calendar year given the year starting and the current numbered year.
 * This is mostly needed as the for loops are 1-based. And the start year is counted.
 *
 * For example:
 * startyear = 2026
 * indexedYear = 3
 *
 * Calendar year = 2028
 *
 * @param startYear The actual year started, e.g. 2026
 * @param indexedYear The year number used in loops, e.g. year 2
 * @returns The adjusted calendar year
 */
export const calculateCalendarYear = (
    startYear: number,
    indexedYear: number,
): number => {
    return startYear + indexedYear - 1;
};

/** Cumulative inflation factor after `years` years: (1 + rate)^years. */
const inflationFactor = (rate: number, years: number): number =>
    (1 + rate) ** years;

const calulateGrowth = (amount: number, rate: number, year: number): number => {
    return amount * (1 + rate) ** (year - 1);
};

const flowEntryAmount = (
    cf: CashFlow,
    year: number,
    input: ProjectionInput,
): number => {
    const calendarYear = calculateCalendarYear(input.startYear, year);
    const fromYear = cf.fromYear ?? input.startYear;
    const toYear = cf.toYear ??
        calculateCalendarYear(input.startYear, input.years);

    // flow not in range
    if (calendarYear < fromYear || calendarYear > toYear) return 0;

    const idx = cf.indexing ?? "none";
    const rate = idx === "inflation"
        ? input.inflationRate
        : idx === "none"
        ? 0
        : idx.rate;

    return calulateGrowth(cf.amount, rate, year);
};

const flowsForYear = (
    flows: CashFlow[],
    year: number,
    input: ProjectionInput,
) => Object.fromEntries(
    flows.map((f) => [f.id, flowEntryAmount(f, year, input)]),
);

/*
let income = 0;
let contributions = 0;
for (const f of flows) {
    const amount = flowsForYear[f.id]!;
    switch (f.type) {
        case "income":
            income += amount;
            break;
        case "contribution":
            contributions += amount;
            break;
        default: {
            const unhandled: never = f;
            throw new Error(
                `unhandled flow type: ${JSON.stringify(unhandled)}`,
            );
        }
    }
}
*/

/**
 * Pre-calculate income/contributions and spending for each year.
 *
 * For each of the years in the projection, check the list of CashFlows. If
 * the income/contributions are applicable to that year, calculate the sum of
 * each along with the inflation adjusted spending for the year.  Return the results
 * as a `ScheduleYear` and add to the list.
 *
 * @param input The ProjectionInput
 * @returns The list of scheduled years
 */
export const buildSchedule = (input: ProjectionInput): ScheduleYear[] => {
    for (let y = 1; y <= input.years; y++) {
        let sr: ScheduleYear = {
            year: y,
            calendarYear: y,
            income: 0,
            spending: 0,
            contributions: 0,
            flows: { inp },
        };
        if (input.flows) {
            for (const cf of input.flows) {
                switch (cf.type) {
                    case "income": {
                    }
                    case "contribution": {
                    }
                }
            }
        }
    }
    return [];
};

export const projectPortfolio = (input: ProjectionInput): ProjectionResult => {
    validateProjectionInput(input);

    // buildSchedule()

    const {
        startBalance,
        returnRate,
        inflationRate,
        spending,
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
        const target = spending *
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
