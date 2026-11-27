import { describe, expect, test } from "bun:test";
import type { CashFlow } from "@/topics/flows/types";
import { amounts as flowAmounts, flowAmount } from "@/topics/flows/schedule";
import { projectionYears } from "@/topics/timeline/schedule";

// Flows from the worked example in design/projection.md
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

describe("age-based flows", () => {
    // Pat born 1960 (66 in 2026), Sam born 1963 (63 in 2026)
    const couple = { pat: 1960, sam: 1963 };
    const withAges = (f: CashFlow, birthYears: Record<string, number> = couple) =>
        years.map((y) => flowAmount(f, y, timeline, inflationRate, birthYears));
    const flat = { type: "contribution", amount: 100, indexing: "none" } as const;

    test("fromAge starts the flow in the year the person reaches it", () => {
        expect(withAges({ ...flat, id: "a", person: "pat", fromAge: 68 })).toEqual([0, 0, 100, 100]);
    });

    test("toAge stops the flow after the year the person reaches it", () => {
        expect(withAges({ ...flat, id: "a", person: "sam", toAge: 64 })).toEqual([100, 100, 0, 0]);
    });

    test("a fromAge before the projection is active from year 1", () => {
        expect(withAges({ ...flat, id: "a", person: "pat", fromAge: 60 })).toEqual([100, 100, 100, 100]);
    });

    test("ages follow the flow's own person", () => {
        // Both age 65: pat in 2025 (before the projection), sam in 2028
        expect(withAges({ ...flat, id: "a", person: "pat", fromAge: 65 })).toEqual([100, 100, 100, 100]);
        expect(withAges({ ...flat, id: "a", person: "sam", fromAge: 65 })).toEqual([0, 0, 100, 100]);
    });

    test("without person, ages use the only person (Decision 4)", () => {
        expect(withAges({ ...flat, id: "a", fromAge: 67, toAge: 68 }, { pat: 1960 })).toEqual([0, 100, 100, 0]);
    });

    test("ages and years mix", () => {
        expect(withAges({ ...flat, id: "a", person: "pat", fromAge: 67, toYear: 2028 })).toEqual([0, 100, 100, 0]);
        expect(withAges({ ...flat, id: "a", person: "sam", fromYear: 2027, toAge: 64 })).toEqual([0, 100, 0, 0]);
    });

    test("an age-dated flow still grows from year 1 (today's dollars)", () => {
        const [, , y3] = withAges({ ...ss, fromYear: undefined, person: "pat", fromAge: 68 });
        expect(y3).toBeCloseTo(25_461.6); // same as ss with fromYear: 2028
    });
});
