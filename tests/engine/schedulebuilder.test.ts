import { describe, expect, test } from "bun:test";
import { buildSchedule } from "@/engine/schedule";
import type { CashFlow, ProjectionInput } from "@/index";

// Worked example from design/projection.md
const pension: CashFlow = {
    id: "pension",
    type: "income",
    source: "pension",
    amount: 20_000,
    indexing: "none",
};
const ss: CashFlow = {
    id: "ss",
    type: "income",
    source: "socialSecurity",
    amount: 24_000,
    indexing: "inflation",
    fromYear: 2028,
};
const savings: CashFlow = {
    id: "savings",
    type: "contribution",
    amount: 10_000,
    indexing: "none",
    toYear: 2027,
};

const example: ProjectionInput = {
    timeline: { startYear: 2026, years: 4 },
    assumptions: { returnRate: 0.05, inflationRate: 0.03 },
    portfolio: { startBalance: 500_000 },
    spending: { annual: 60_000 },
    flows: [pension, ss, savings],
};

const noFlows: ProjectionInput = { ...example, flows: undefined };

describe("worked example", () => {
    const schedule = buildSchedule(example);

    // The schedule table in design/projection.md
    test.each([
        // year, calendar, spending, pension, ss, savings, income, contributions
        [1, 2026, 60_000, 20_000, 0, 10_000, 20_000, 10_000],
        [2, 2027, 61_800, 20_000, 0, 10_000, 20_000, 10_000],
        [3, 2028, 63_654, 20_000, 25_461.6, 0, 45_461.6, 0],
        [4, 2029, 65_563.62, 20_000, 26_225.45, 0, 46_225.45, 0],
    ])(
        "year %i (%i)",
        (year, calendarYear, spending, p, s, sv, income, contributions) => {
            const row = schedule[year - 1]!;
            expect(row.year).toBe(year);
            expect(row.calendarYear).toBe(calendarYear);
            expect(row.spending).toBeCloseTo(spending);
            expect(row.flows.pension).toBeCloseTo(p);
            expect(row.flows.ss).toBeCloseTo(s);
            expect(row.flows.savings).toBeCloseTo(sv);
            expect(row.income).toBeCloseTo(income);
            expect(row.contributions).toBeCloseTo(contributions);
        },
    );
});

describe("rows", () => {
    test("one row per year, in order, with matching calendar years", () => {
        const schedule = buildSchedule({
            ...example,
            timeline: { startYear: 2030, years: 30 },
        });
        expect(schedule).toHaveLength(30);
        schedule.forEach((row, i) => {
            expect(row.year).toBe(i + 1);
            expect(row.calendarYear).toBe(2030 + i);
        });
    });

    test("every row has exactly the ScheduleYear fields", () => {
        const [row] = buildSchedule(example);
        expect(Object.keys(row!).sort()).toEqual(
            [
                "ages",
                "calendarYear",
                "contributions",
                "flows",
                "income",
                "spending",
                "year",
            ],
        );
    });
});

describe("spending", () => {
    test("year 1 is not inflated; inflation compounds from year 2", () => {
        const schedule = buildSchedule(noFlows);
        expect(schedule[0]!.spending).toBe(60_000);
        expect(schedule[3]!.spending).toBeCloseTo(60_000 * 1.03 ** 3);
    });

    test("0% inflation keeps spending flat", () => {
        const schedule = buildSchedule({
            ...noFlows,
            assumptions: { returnRate: 0.05, inflationRate: 0 },
        });
        expect(schedule.map((r) => r.spending)).toEqual([
            60_000,
            60_000,
            60_000,
            60_000,
        ]);
    });

    test("0 spending stays 0", () => {
        const schedule = buildSchedule({ ...noFlows, spending: { annual: 0 } });
        expect(schedule.every((r) => r.spending === 0)).toBe(true);
    });
});

describe("flows", () => {
    test("no flows: income and contributions are 0 and the record is empty", () => {
        for (const row of buildSchedule(noFlows)) {
            expect(row.income).toBe(0);
            expect(row.contributions).toBe(0);
            expect(row.flows).toEqual({});
        }
    });

    test("an empty flows list gives the same schedule as no flows", () => {
        expect(buildSchedule({ ...example, flows: [] })).toEqual(
            buildSchedule(noFlows),
        );
    });

    test("every flow id appears in every row, including inactive years", () => {
        for (const row of buildSchedule(example)) {
            expect(Object.keys(row.flows).sort()).toEqual([
                "pension",
                "savings",
                "ss",
            ]);
        }
    });

    test("income and contributions are the sums of their flows' amounts", () => {
        for (const row of buildSchedule(example)) {
            expect(row.income).toBeCloseTo(row.flows.pension! + row.flows.ss!);
            expect(row.contributions).toBe(row.flows.savings!);
        }
    });

    test("several flows of the same type add up", () => {
        const schedule = buildSchedule({
            ...example,
            flows: [
                pension,
                { ...pension, id: "pension2", amount: 5_000 },
                savings,
                { ...savings, id: "roth", amount: 7_000 },
            ],
        });
        expect(schedule[0]!.income).toBe(25_000);
        expect(schedule[0]!.contributions).toBe(17_000);
    });

    test("a flow outside the projection's years is 0 in every row", () => {
        const later: CashFlow = { ...pension, id: "later", fromYear: 2040 };
        const schedule = buildSchedule({ ...example, flows: [later] });
        expect(schedule.every((r) => r.flows.later === 0 && r.income === 0))
            .toBe(true);
    });
});

describe("independence from the portfolio", () => {
    test("startBalance and returnRate don't change the schedule", () => {
        const other = buildSchedule({
            ...example,
            portfolio: { startBalance: 1 },
            assumptions: { ...example.assumptions, returnRate: -0.5 },
        });
        expect(other).toEqual(buildSchedule(example));
    });

    test("doesn't modify the input", () => {
        const input = structuredClone(example);
        buildSchedule(input);
        expect(input).toEqual(example);
    });
});

describe("household", () => {
    test("each row has each person's age that year", () => {
        const schedule = buildSchedule({
            ...example,
            household: { people: [{ id: "pat", birthYear: 1960 }, { id: "sam", birthYear: 1963 }] },
        });
        expect(schedule.map((r) => r.ages)).toEqual([
            { pat: 66, sam: 63 },
            { pat: 67, sam: 64 },
            { pat: 68, sam: 65 },
            { pat: 69, sam: 66 },
        ]);
    });

    test("age-based flows are resolved with the household's birth years", () => {
        const schedule = buildSchedule({
            ...example,
            household: { people: [{ id: "pat", birthYear: 1960 }, { id: "sam", birthYear: 1963 }] },
            flows: [
                { id: "pat-ss", type: "income", source: "socialSecurity", amount: 1_000, indexing: "none", person: "pat", fromAge: 67 },
                { id: "sam-401k", type: "contribution", amount: 500, person: "sam", toAge: 64 },
            ],
        });
        expect(schedule.map((r) => r.flows)).toEqual([
            { "pat-ss": 0, "sam-401k": 500 },
            { "pat-ss": 1_000, "sam-401k": 500 },
            { "pat-ss": 1_000, "sam-401k": 0 },
            { "pat-ss": 1_000, "sam-401k": 0 },
        ]);
        expect(schedule.map((r) => [r.income, r.contributions])).toEqual([
            [0, 500], [1_000, 500], [1_000, 0], [1_000, 0],
        ]);
    });

    test("no household gives empty ages", () => {
        for (const row of buildSchedule(example)) expect(row.ages).toEqual({});
    });
});
