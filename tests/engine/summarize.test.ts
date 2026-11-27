import { describe, expect, test } from "bun:test";
import type { ProjectionYear } from "@/engine/result";
import { summarize } from "@/engine/summarize";

const row = (year: number, o: Partial<ProjectionYear> = {}): ProjectionYear => ({
    year,
    calendarYear: 2025 + year,
    spending: 0,
    income: 0,
    contributions: 0,
    flows: {},
    ages: {},
    startBalance: 0,
    withdrawal: 0,
    shortfall: 0,
    surplus: 0,
    growth: 0,
    endBalance: 0,
    endBalanceReal: 0,
    ...o,
});

describe("summarize", () => {
    test("totals are the sums of the rows; end balances come from the last row", () => {
        const summary = summarize([
            row(1, { withdrawal: 10, shortfall: 0, income: 5, contributions: 1, endBalance: 90, endBalanceReal: 88 }),
            row(2, { withdrawal: 20, shortfall: 3, income: 6, contributions: 2, endBalance: 70, endBalanceReal: 66 }),
            row(3, { withdrawal: 30, shortfall: 4, income: 7, contributions: 3, endBalance: 50, endBalanceReal: 46 }),
        ]);
        expect(summary).toEqual({
            endBalance: 50,
            endBalanceReal: 46,
            totalWithdrawn: 60,
            totalShortfall: 7,
            totalIncome: 18,
            totalContributions: 6,
            firstShortfallYear: 2,
        });
    });

    test("firstShortfallYear is the first row with shortfall > 0", () => {
        const years = [row(1), row(2), row(3, { shortfall: 1 }), row(4), row(5, { shortfall: 2 })];
        expect(summarize(years).firstShortfallYear).toBe(3);
    });

    test("firstShortfallYear is null when spending is always covered", () => {
        expect(summarize([row(1), row(2)]).firstShortfallYear).toBeNull();
    });
});
