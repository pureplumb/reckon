import { describe, expect, test } from "bun:test";
import type { CashFlow } from "@/index";
import { validateFlows } from "@/topics/flows/validate";

const timeline = { startYear: 2026, years: 10 };

const pension: CashFlow = {
    id: "pension",
    type: "income",
    source: "pension",
    amount: 20_000,
    indexing: "none",
};
const savings: CashFlow = { id: "savings", type: "contribution", amount: 10_000 };

/** Validates [pension, savings] with flow 1 (savings) changed. */
const check = (o: Partial<CashFlow>) => () =>
    validateFlows([pension, { ...savings, ...o } as CashFlow], timeline);

describe("validateFlows", () => {
    test("valid flows, and no flows, do not throw", () => {
        expect(() => validateFlows([pension, savings], timeline)).not.toThrow();
        expect(() => validateFlows([], timeline)).not.toThrow();
    });

    // [override, message]: each must throw a RangeError with exactly this message.
    test.each<[Partial<CashFlow>, string]>([
        [{ id: "" }, 'flows[1].id must be a non-empty string, got ""'],
        [{ id: "pension" }, 'flows[1].id must be unique, got "pension" (also flows[0].id)'],
        [{ amount: -5 }, "flows[1].amount must be >= 0, got -5"],
        [{ amount: NaN }, "flows[1].amount must be >= 0, got NaN"],
        [{ amount: Infinity }, "flows[1].amount must be >= 0, got Infinity"],
        [{ fromYear: 2025 }, "flows[1].fromYear must be a whole number >= timeline.startYear (2026), got 2025"],
        [{ fromYear: 2027.5 }, "flows[1].fromYear must be a whole number >= timeline.startYear (2026), got 2027.5"],
        [{ fromYear: NaN }, "flows[1].fromYear must be a whole number >= timeline.startYear (2026), got NaN"],
        [{ toYear: 2025 }, "flows[1].toYear must be a whole number >= timeline.startYear (2026), got 2025"],
        [{ toYear: 2030.5 }, "flows[1].toYear must be a whole number >= timeline.startYear (2026), got 2030.5"],
        [{ fromYear: 2030, toYear: 2029 }, "flows[1].toYear must be >= fromYear (2030), got 2029"],
        [{ indexing: { rate: -1 } }, "flows[1].indexing.rate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got -1"],
        [{ indexing: { rate: 5 } }, "flows[1].indexing.rate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got 5"],
        [{ indexing: { rate: NaN } }, "flows[1].indexing.rate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got NaN"],
    ])("rejects %p", (o, message) => {
        expect(check(o)).toThrow(RangeError);
        expect(check(o)).toThrow(message);
    });

    test.each<Partial<CashFlow>>([
        { amount: 0 },
        { fromYear: 2026 },
        { toYear: 2026 },
        { fromYear: 2030, toYear: 2030 },
        { toYear: 2200 }, // past the projection's end: the flow just stops with it
        { indexing: { rate: -0.9999 } },
        { indexing: { rate: 1 } },
        { indexing: "inflation" },
    ])("accepts %p", (o) => {
        expect(check(o)).not.toThrow();
    });

    test("ids are compared exactly", () => {
        expect(check({ id: "Pension" })).not.toThrow();
    });

    test("reports the first invalid flow", () => {
        const bad = { ...savings, amount: -1 };
        expect(() => validateFlows([pension, bad, { ...bad, id: "x" }], timeline))
            .toThrow(/^flows\[1\]\.amount/);
    });
});
