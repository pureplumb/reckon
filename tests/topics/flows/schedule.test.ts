import { describe, expect, test } from "bun:test";
import type { CashFlow } from "@/topics/flows/types";
import { amounts as flowAmounts, flowAmount } from "@/topics/flows/schedule";
import { projectionYears } from "@/topics/timeline/schedule";

// Flows from the worked example in design/cash-flows.md
const timeline = { startYear: 2026, years: 4 };
const inflationRate = 0.03;
const years = projectionYears(timeline);
const pension: CashFlow = { id: "pension", type: "income", source: "pension", amount: 20_000, indexing: "none" };
const ss: CashFlow = { id: "ss", type: "income", source: "socialSecurity", amount: 24_000, indexing: "inflation", fromYear: 2028 };
const savings: CashFlow = { id: "savings", type: "contribution", amount: 10_000, toYear: 2027 };

const amounts = (f: CashFlow) => years.map((y) => flowAmount(f, y, timeline, inflationRate));

describe("flowAmount", () => {
    test("indexing none stays flat in every year", () => {
        expect(amounts(pension)).toEqual([20_000, 20_000, 20_000, 20_000]);
    });

    test("is 0 before fromYear, then grows with inflation from year 1 (today's dollars)", () => {
        const [y1, y2, y3, y4] = amounts(ss);
        expect([y1, y2]).toEqual([0, 0]);
        expect(y3).toBeCloseTo(25_461.6);
        expect(y4).toBeCloseTo(26_225.45);
    });

    test("is 0 after toYear; contribution indexing defaults to none", () => {
        expect(amounts(savings)).toEqual([10_000, 10_000, 0, 0]);
    });

    test("an explicit rate grows at that rate", () => {
        const f: CashFlow = { id: "raise", type: "contribution", amount: 1_000, indexing: { rate: 0.1 } };
        expect(amounts(f)[2]).toBeCloseTo(1_210);
    });
});

describe("amounts", () => {
    test("returns each flow's amount keyed by id", () => {
        const record = flowAmounts([pension, ss, savings], years[0]!, timeline, inflationRate);
        expect(record).toEqual({ pension: 20_000, ss: 0, savings: 10_000 });
    });
});
