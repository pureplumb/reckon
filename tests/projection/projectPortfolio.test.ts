import { describe, expect, test } from "bun:test";
import { type ProjectionInput, projectPortfolio } from "@/projection";

// Worked example from design/projection.md
const example: ProjectionInput = {
    startBalance: 1_000_000,
    returnRate: 0.05,
    inflationRate: 0.03,
    annualWithdrawal: 40_000,
    years: 3,
    startYear: 2026,
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("worked example", () => {
    const { years, summary } = projectPortfolio(example);

    test.each([
        // year, start, withdrawal, growth, end, endReal
        [1, 1_000_000, 40_000, 48_000, 1_008_000, 978_640.78],
        [2, 1_008_000, 41_200, 48_340, 1_015_140, 956_866.81],
        [3, 1_015_140, 42_436, 48_635.2, 1_021_339.2, 934_670.05],
    ])("year %i", (year, start, withdrawal, growth, end, endReal) => {
        const row = years[year - 1]!;
        expect(row.year).toBe(year);
        expect(row.startBalance).toBeCloseTo(start);
        expect(row.withdrawal).toBeCloseTo(withdrawal);
        expect(row.shortfall).toBe(0);
        expect(row.growth).toBeCloseTo(growth);
        expect(row.endBalance).toBeCloseTo(end);
        expect(row.endBalanceReal).toBeCloseTo(endReal);
    });

    test("summary", () => {
        expect(summary.endBalance).toBeCloseTo(1_021_339.2);
        expect(summary.endBalanceReal).toBeCloseTo(934_670.05);
        expect(summary.totalWithdrawn).toBeCloseTo(123_636);
        expect(summary.totalShortfall).toBe(0);
        expect(summary.depletedInYear).toBeNull();
    });
});

describe("withdrawals and growth", () => {
    test("0% return and 0% inflation: balance drops by exactly the withdrawal", () => {
        const { years } = projectPortfolio({
            startBalance: 1_000,
            returnRate: 0,
            inflationRate: 0,
            annualWithdrawal: 100,
            years: 5,
            startYear: 2026,
        });
        expect(years.map((y) => y.endBalance)).toEqual([
            900,
            800,
            700,
            600,
            500,
        ]);
        expect(years.every((y) => y.withdrawal === 100 && y.growth === 0)).toBe(
            true,
        );
    });

    test("year 1 withdrawal is not inflated; inflation compounds from year 2", () => {
        const { years } = projectPortfolio({ ...example, years: 4 });
        expect(years[0]!.withdrawal).toBe(40_000);
        expect(years[3]!.withdrawal).toBeCloseTo(40_000 * 1.03 ** 3);
    });

    test("withdrawal happens before growth", () => {
        const { years } = projectPortfolio({ ...example, years: 1 });
        expect(years[0]!.growth).toBeCloseTo((1_000_000 - 40_000) * 0.05);
    });

    test("no withdrawal: balance compounds at the return rate", () => {
        const { summary } = projectPortfolio({
            ...example,
            annualWithdrawal: 0,
            years: 10,
        });
        expect(summary.endBalance).toBeCloseTo(1_000_000 * 1.05 ** 10);
        expect(summary.totalWithdrawn).toBe(0);
    });

    test("negative return shrinks the balance but never below 0", () => {
        const { years } = projectPortfolio({
            ...example,
            returnRate: -0.5,
            years: 10,
        });
        expect(years[0]!.endBalance).toBeCloseTo(480_000);
        expect(years.every((y) => y.endBalance >= 0)).toBe(true);
    });

    test("each year starts with the previous year's end balance", () => {
        const { years } = projectPortfolio({ ...example, years: 10 });
        for (let i = 1; i < years.length; i++) {
            expect(years[i]!.startBalance).toBe(years[i - 1]!.endBalance);
        }
    });

    test("real balance divides by cumulative inflation to that year", () => {
        const { years } = projectPortfolio({ ...example, years: 5 });
        years.forEach((y) => {
            expect(y.endBalanceReal).toBeCloseTo(y.endBalance / 1.03 ** y.year);
        });
    });

    test("summary totals match the yearly rows", () => {
        const { years, summary } = projectPortfolio({ ...example, years: 30 });
        expect(summary.endBalance).toBe(years.at(-1)!.endBalance);
        expect(summary.endBalanceReal).toBe(years.at(-1)!.endBalanceReal);
        expect(summary.totalWithdrawn).toBeCloseTo(
            sum(years.map((y) => y.withdrawal)),
        );
    });
});

describe("depletion", () => {
    // $100, $60/yr, 10% inflation: targets 60, 66, 72.60, 79.86
    const { years, summary } = projectPortfolio({
        startBalance: 100,
        returnRate: 0,
        inflationRate: 0.1,
        annualWithdrawal: 60,
        years: 4,
        startYear: 2026,
    });

    test("output always has one row per year", () => {
        expect(years).toHaveLength(4);
    });

    test("withdrawal is capped at the remaining balance, with a partial shortfall", () => {
        expect(years[0]!.withdrawal).toBe(60);
        expect(years[0]!.shortfall).toBe(0);
        expect(years[1]!.withdrawal).toBe(40);
        expect(years[1]!.shortfall).toBeCloseTo(26);
        expect(years[1]!.endBalance).toBe(0);
    });

    test("years after depletion have zero balances and the full target as shortfall", () => {
        expect(years[2]).toMatchObject({
            startBalance: 0,
            withdrawal: 0,
            growth: 0,
            endBalance: 0,
        });
        expect(years[2]!.shortfall).toBeCloseTo(72.6);
        expect(years[3]!.shortfall).toBeCloseTo(79.86);
    });

    test("summary", () => {
        expect(summary.depletedInYear).toBe(2);
        expect(summary.endBalance).toBe(0);
        expect(summary.totalWithdrawn).toBe(100);
        expect(summary.totalShortfall).toBeCloseTo(26 + 72.6 + 79.86);
    });

    test("withdrawal plus shortfall always equals the inflation-adjusted target", () => {
        years.forEach((y) => {
            expect(y.withdrawal + y.shortfall).toBeCloseTo(
                60 * 1.1 ** (y.year - 1),
            );
        });
    });
});

describe("calendarYear", () => {
    test("set from startYear when given", () => {
        const { years } = projectPortfolio({ ...example, startYear: 2026 });
        expect(years.map((y) => y.calendarYear)).toEqual([2026, 2027, 2028]);
    });
});

describe("input validation", () => {
    const run = (overrides: Partial<ProjectionInput>) => () =>
        projectPortfolio({ ...example, ...overrides });

    test("valid input does not throw", () => {
        expect(run({})).not.toThrow();
    });

    // Each case: the invalid value is rejected with a RangeError whose message
    // names the field and the value it got (design/validation.md#errors).
    test.each<[keyof ProjectionInput, number]>([
        ["startBalance", 0],
        ["startBalance", -1],
        ["startBalance", NaN],
        ["startBalance", Infinity],
        ["returnRate", -1],
        ["returnRate", -1.5],
        ["returnRate", 1.0001],
        ["returnRate", NaN],
        ["inflationRate", -1],
        ["inflationRate", 1.0001],
        ["inflationRate", NaN],
        ["annualWithdrawal", -1],
        ["annualWithdrawal", NaN],
        ["annualWithdrawal", Infinity],
        ["years", 0],
        ["years", 151],
        ["years", 2.5],
        ["years", NaN],
        ["startYear", 2026.5],
        ["startYear", NaN],
    ])("rejects %s = %p", (field, value) => {
        const call = run({ [field]: value });
        expect(call).toThrow(RangeError);
        expect(call).toThrow(field);
        expect(call).toThrow(`got ${value}`);
    });

    test.each<[keyof ProjectionInput, number]>([
        ["startBalance", 0.01],
        ["returnRate", -0.9999],
        ["returnRate", 1],
        ["inflationRate", -0.9999],
        ["inflationRate", 1],
        ["annualWithdrawal", 0],
        ["years", 1],
        ["years", 150],
    ])("accepts boundary %s = %p", (field, value) => {
        expect(run({ [field]: value })).not.toThrow();
    });

    test.each(["returnRate", "inflationRate"] as const)(
        "%s entered as a percent gives the units hint",
        (field) => {
            expect(run({ [field]: 5 })).toThrow("0.05 means 5%");
        },
    );
});
