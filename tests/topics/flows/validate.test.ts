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

    describe("person and ages", () => {
        const couple = { pat: 1960, sam: 1963 };
        const single = { pat: 1960 };
        const checkWith = (birthYears: Record<string, number>, o: Partial<CashFlow>) => () =>
            validateFlows([pension, { ...savings, ...o } as CashFlow], timeline, birthYears);

        test.each<[Record<string, number>, Partial<CashFlow>, string]>([
            [couple, { person: "alex" }, 'flows[1].person must name a person in household.people, got "alex"'],
            [{}, { person: "pat" }, 'flows[1].person must name a person in household.people, got "pat"'],
            [couple, { person: "pat", fromAge: -1 }, "flows[1].fromAge must be a whole number from 0 to 120, got -1"],
            [couple, { person: "pat", fromAge: 121 }, "flows[1].fromAge must be a whole number from 0 to 120, got 121"],
            [couple, { person: "pat", fromAge: 62.5 }, "flows[1].fromAge must be a whole number from 0 to 120, got 62.5"],
            [couple, { person: "pat", toAge: NaN }, "flows[1].toAge must be a whole number from 0 to 120, got NaN"],
            [couple, { person: "pat", fromAge: 70, toAge: 65 }, "flows[1].toAge must be >= fromAge (70), got 65"],
            [couple, { person: "pat", fromAge: 67, fromYear: 2027 }, "flows[1].fromAge must not be given with fromYear (2027), got 67"],
            [couple, { person: "pat", toAge: 70, toYear: 2030 }, "flows[1].toAge must not be given with toYear (2030), got 70"],
            [{}, { fromAge: 67 }, "flows[1].fromAge needs a household, got 67"],
            [{}, { toAge: 70 }, "flows[1].toAge needs a household, got 70"],
            [couple, { fromAge: 67 }, "flows[1].fromAge needs person when the household has 2 people, got 67"],
            // Mixed ranges, compared as calendar years (pat born 1960)
            [couple, { person: "pat", fromAge: 67, toYear: 2026 }, "flows[1].toYear must be >= the year pat reaches fromAge (2027, age 67), got 2026"],
            [couple, { person: "pat", fromYear: 2030, toAge: 69 }, "flows[1].toAge must be >= pat's age in fromYear (70 in 2030), got 69"],
            [single, { fromYear: 2030, toAge: 65 }, "flows[1].toAge must be >= pat's age in fromYear (70 in 2030), got 65"],
            // toAge before the projection starts (pat is 66, sam 63 in 2026)
            [couple, { person: "pat", toAge: 64 }, "flows[1].toAge must be >= pat's age at timeline.startYear (66), got 64"],
            [couple, { person: "pat", fromAge: 55, toAge: 60 }, "flows[1].toAge must be >= pat's age at timeline.startYear (66), got 60"],
            [single, { toAge: 65 }, "flows[1].toAge must be >= pat's age at timeline.startYear (66), got 65"],
        ])("rejects %p %p", (birthYears, o, message) => {
            expect(checkWith(birthYears, o)).toThrow(RangeError);
            expect(checkWith(birthYears, o)).toThrow(message);
        });

        test.each<[Record<string, number>, Partial<CashFlow>]>([
            [couple, { person: "sam" }], // person with calendar years
            [couple, { person: "pat", fromAge: 0, toAge: 120 }],
            [couple, { person: "pat", fromAge: 60 }], // before the projection starts: allowed
            [couple, { person: "pat", fromAge: 67, toAge: 67 }],
            [couple, { person: "pat", fromAge: 67, toYear: 2030 }], // age and year mixed
            [couple, { person: "pat", fromAge: 67, toYear: 2027 }], // one year: 2027 to 2027
            [couple, { person: "pat", fromAge: 60, toYear: 2026 }], // started before the projection
            [couple, { person: "pat", fromYear: 2030, toAge: 70 }], // one year: age 70 in 2030
            [couple, { person: "sam", fromYear: 2030, toAge: 67 }], // sam's age, not pat's
            [couple, { person: "pat", toAge: 66 }], // pat's age at startYear: year 1 only
            [couple, { person: "sam", toAge: 64 }], // 64 is past for pat, not for sam
            [single, { fromAge: 67 }], // Decision 4: defaults to the only person
            [{}, { fromYear: 2027 }], // no household: calendar years work as before
        ])("accepts %p %p", (birthYears, o) => {
            expect(checkWith(birthYears, o)).not.toThrow();
        });
    });
});
