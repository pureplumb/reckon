import { describe, expect, test } from "bun:test";
import type { CashFlow, ProjectionInput } from "@/index";
import { buildSchedule } from "@/engine/schedule";
import { simulate } from "@/engine/simulate";
import { expectEquationsHold } from "../helpers/equations";

/**
 * Builds the schedule and simulates (no validation; that is covered in
 * projectPortfolio.test.ts). Every run checks the yearly equations.
 */
const run = (input: ProjectionInput) => {
    const result = simulate(input, buildSchedule(input));
    expectEquationsHold(result);
    return result;
};

/** A flat-dollar input: 0% return, 0% inflation unless overridden. */
const flat = (
    startBalance: number,
    spending: number,
    years: number,
    flows: CashFlow[] = [],
    returnRate = 0,
): ProjectionInput => ({
    timeline: { startYear: 2026, years },
    assumptions: { returnRate, inflationRate: 0 },
    portfolio: { startBalance },
    spending: { annual: spending },
    flows,
});

const contribution = (
    amount: number,
    range: { fromYear?: number; toYear?: number } = {},
): CashFlow => ({ id: "savings", type: "contribution", amount, ...range });

const income = (
    amount: number,
    range: { fromYear?: number; toYear?: number } = {},
): CashFlow => ({
    id: "pension",
    type: "income",
    source: "pension",
    amount,
    indexing: "none",
    ...range,
});

// Worked example from design/cash-flows.md
describe("worked example", () => {
    const { years, summary } = run({
        timeline: { startYear: 2026, years: 4 },
        assumptions: { returnRate: 0.05, inflationRate: 0.03 },
        portfolio: { startBalance: 500_000 },
        spending: { annual: 60_000 },
        flows: [
            {
                id: "pension",
                type: "income",
                source: "pension",
                amount: 20_000,
                indexing: "none",
            },
            {
                id: "ss",
                type: "income",
                source: "socialSecurity",
                amount: 24_000,
                indexing: "inflation",
                fromYear: 2028,
            },
            {
                id: "savings",
                type: "contribution",
                amount: 10_000,
                indexing: "none",
                toYear: 2027,
            },
        ],
    });

    test.each([
        // year, start, contributions, spending, income, withdrawal, growth, end, endReal
        [1, 500_000, 10_000, 60_000, 20_000, 40_000, 23_500, 493_500, 479_126.21],
        [2, 493_500, 10_000, 61_800, 20_000, 41_800, 23_085, 484_785, 456_956.36],
        [3, 484_785, 0, 63_654, 45_461.6, 18_192.4, 23_329.63, 489_922.23, 448_348.24],
        [4, 489_922.23, 0, 65_563.62, 46_225.45, 19_338.17, 23_529.2, 494_113.26, 439_013.23],
    ])(
        "year %i",
        (year, start, contributions, spending, inc, withdrawal, growth, end, endReal) => {
            const row = years[year - 1]!;
            expect(row.year).toBe(year);
            expect(row.calendarYear).toBe(2025 + year);
            expect(row.startBalance).toBeCloseTo(start, 2);
            expect(row.contributions).toBeCloseTo(contributions, 2);
            expect(row.spending).toBeCloseTo(spending, 2);
            expect(row.income).toBeCloseTo(inc, 2);
            expect(row.withdrawal).toBeCloseTo(withdrawal, 2);
            expect(row.growth).toBeCloseTo(growth, 2);
            expect(row.endBalance).toBeCloseTo(end, 2);
            expect(row.endBalanceReal).toBeCloseTo(endReal, 2);
            expect(row.shortfall).toBe(0);
            expect(row.surplus).toBe(0);
        },
    );

    test("flows holds every flow's amount each year", () => {
        expect(years.map((y) => Object.keys(y.flows).sort())).toEqual(
            Array(4).fill(["pension", "savings", "ss"]),
        );
        expect(years[0]!.flows).toEqual({ pension: 20_000, ss: 0, savings: 10_000 });
        expect(years[2]!.flows.ss).toBeCloseTo(25_461.6, 2);
        expect(years[2]!.flows.savings).toBe(0);
        expect(years[3]!.flows.ss).toBeCloseTo(24_000 * 1.03 ** 3, 2);
    });

    test("summary", () => {
        expect(summary.endBalance).toBeCloseTo(494_113.26, 2);
        expect(summary.endBalanceReal).toBeCloseTo(439_013.23, 2);
        expect(summary.totalWithdrawn).toBeCloseTo(
            40_000 + 41_800 + 18_192.4 + 19_338.17,
            1,
        );
        expect(summary.totalShortfall).toBe(0);
        expect(summary.totalIncome).toBeCloseTo(
            20_000 + 20_000 + 45_461.6 + 46_225.45,
            1,
        );
        expect(summary.totalContributions).toBe(20_000);
        expect(summary.firstShortfallYear).toBeNull();
    });
});

/**
 * The stage 1 engine (before cash flows), kept here as a reference: with no
 * flows, simulate must match it on every field except firstShortfallYear.
 */
const stage1 = (input: ProjectionInput) => {
    const { returnRate, inflationRate } = input.assumptions;
    let balance = input.portfolio.startBalance;
    let depletedInYear: number | null = null;
    const years = [];
    for (let year = 1; year <= input.timeline.years; year++) {
        const target = input.spending.annual * (1 + inflationRate) ** (year - 1);
        const withdrawal = Math.min(target, balance);
        const afterDraw = balance - withdrawal;
        const growth = afterDraw * returnRate + 0; // + 0 turns -0 into 0
        const endBalance = afterDraw + growth;
        if (depletedInYear === null && endBalance <= 0) depletedInYear = year;
        years.push({
            year,
            calendarYear: input.timeline.startYear + year - 1,
            startBalance: balance,
            withdrawal,
            shortfall: target - withdrawal,
            growth,
            endBalance,
            endBalanceReal: endBalance / (1 + inflationRate) ** year,
        });
        balance = endBalance;
    }
    return { years, depletedInYear };
};

describe("no flows matches the stage 1 engine", () => {
    test.each<[string, ProjectionInput]>([
        ["stage 1 worked example", {
            timeline: { startYear: 2026, years: 30 },
            assumptions: { returnRate: 0.05, inflationRate: 0.03 },
            portfolio: { startBalance: 1_000_000 },
            spending: { annual: 40_000 },
        }],
        ["depletes mid-projection", {
            timeline: { startYear: 2026, years: 40 },
            assumptions: { returnRate: 0.02, inflationRate: 0.04 },
            portfolio: { startBalance: 500_000 },
            spending: { annual: 45_000 },
        }],
        ["negative return", {
            timeline: { startYear: 2026, years: 10 },
            assumptions: { returnRate: -0.3, inflationRate: 0.02 },
            portfolio: { startBalance: 100_000 },
            spending: { annual: 10_000 },
        }],
    ])("%s", (_, input) => {
        const { years } = run(input);
        const expected = stage1(input);
        expect(years).toHaveLength(expected.years.length);
        years.forEach((y, i) => {
            expect(y).toMatchObject(expected.years[i]!);
            expect(y).toMatchObject({ income: 0, contributions: 0, surplus: 0, flows: {} });
        });
    });

    test("firstShortfallYear can be one year after the old depletedInYear", () => {
        // Year 2 withdraws the last $50 and ends at $0 with spending covered.
        const input = flat(100, 50, 4);
        const { years, summary } = run(input);
        expect(stage1(input).depletedInYear).toBe(2);
        expect(years[1]!.endBalance).toBe(0);
        expect(years[1]!.shortfall).toBe(0);
        expect(summary.firstShortfallYear).toBe(3);
    });
});

describe("income", () => {
    test("income equal to spending: no withdrawal, balance changes only by growth", () => {
        const { years, summary } = run({
            timeline: { startYear: 2026, years: 5 },
            assumptions: { returnRate: 0.05, inflationRate: 0.03 },
            portfolio: { startBalance: 1_000 },
            spending: { annual: 100 },
            flows: [{
                id: "pension",
                type: "income",
                source: "pension",
                amount: 100,
                indexing: "inflation",
            }],
        });
        years.forEach((y) => {
            expect(y.withdrawal).toBe(0);
            expect(y.shortfall).toBe(0);
            expect(y.surplus).toBe(0);
            expect(y.endBalance).toBeCloseTo(y.startBalance * 1.05);
        });
        expect(summary.endBalance).toBeCloseTo(1_000 * 1.05 ** 5);
        expect(summary.totalWithdrawn).toBe(0);
    });

    test("income above spending is reinvested as surplus", () => {
        const { years, summary } = run(flat(1_000, 100, 2, [income(150)]));
        expect(years.map((y) => y.surplus)).toEqual([50, 50]);
        expect(years.map((y) => y.withdrawal)).toEqual([0, 0]);
        expect(years.map((y) => y.endBalance)).toEqual([1_050, 1_100]);
        expect(summary.totalIncome).toBe(300);
    });

    test("surplus is reinvested before growth, so it earns that year's return", () => {
        const { years } = run(flat(1_000, 100, 1, [income(150)], 0.1));
        expect(years[0]!.growth).toBeCloseTo(1_050 * 0.1);
    });
});

describe("contributions", () => {
    test("contributions fund a same-year withdrawal", () => {
        const { years } = run(flat(0, 100, 1, [contribution(100)]));
        expect(years[0]).toMatchObject({
            startBalance: 0,
            contributions: 100,
            withdrawal: 100,
            shortfall: 0,
            endBalance: 0,
        });
    });

    test("contributions are deposited before growth, so they earn that year's return", () => {
        const { years } = run(flat(1_000, 0, 1, [contribution(100)], 0.1));
        expect(years[0]!.growth).toBeCloseTo(1_100 * 0.1);
    });

    test("a $0 start with contributions builds a balance with no shortfall", () => {
        const { years, summary } = run(
            flat(0, 5_000, 3, [contribution(10_000)], 0.05),
        );
        expect(years[0]!.endBalance).toBeCloseTo(5_000 * 1.05);
        expect(years[1]!.endBalance).toBeCloseTo((5_250 + 5_000) * 1.05);
        expect(years.every((y) => y.endBalance > y.startBalance)).toBe(true);
        expect(summary.totalShortfall).toBe(0);
        expect(summary.firstShortfallYear).toBeNull();
        expect(summary.totalContributions).toBe(30_000);
    });
});

describe("depletion and recovery", () => {
    // $100, $60/yr: year 2 runs short by $20, money arrives from 2028 (year 3).
    test.each<[string, CashFlow]>([
        ["contributions", contribution(160, { fromYear: 2028 })],
        ["income surplus", income(160, { fromYear: 2028 })],
    ])("later %s rebuild the balance after depletion", (_, flow) => {
        const { years } = run(flat(100, 60, 4, [flow]));
        expect(years[1]).toMatchObject({ withdrawal: 40, shortfall: 20, endBalance: 0 });
        expect(years[2]!.shortfall).toBe(0);
        expect(years[2]!.endBalance).toBe(100);
        expect(years[3]!.endBalance).toBe(200);
    });

    test("firstShortfallYear is the first year with shortfall, even if the balance recovers", () => {
        const { summary } = run(
            flat(100, 60, 4, [contribution(160, { fromYear: 2028 })]),
        );
        expect(summary.firstShortfallYear).toBe(2);
        expect(summary.totalShortfall).toBe(20);
        expect(summary.endBalance).toBe(200);
    });

    test("a $0 start with no money coming in is short from year 1", () => {
        const { years, summary } = run(flat(0, 100, 3));
        expect(years.every((y) => y.withdrawal === 0 && y.shortfall === 100)).toBe(true);
        expect(summary.firstShortfallYear).toBe(1);
    });
});

test("simulate does not change its input", () => {
    const input = flat(1_000, 100, 3, [income(50), contribution(25)], 0.05);
    const copy = structuredClone(input);
    const schedule = buildSchedule(input);
    const scheduleCopy = structuredClone(schedule);
    simulate(input, schedule);
    expect(input).toEqual(copy);
    expect(schedule).toEqual(scheduleCopy);
});
