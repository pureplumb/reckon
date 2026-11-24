import { describe, expect, test } from "bun:test";
import { projectionYears } from "@/topics/timeline/schedule";

describe("projectionYears", () => {
    test("pairs each projection year with its calendar year", () => {
        expect(projectionYears({ startYear: 2026, years: 3 })).toEqual([
            { year: 1, calendarYear: 2026 },
            { year: 2, calendarYear: 2027 },
            { year: 3, calendarYear: 2028 },
        ]);
    });

    test("returns one entry per year", () => {
        expect(projectionYears({ startYear: 2026, years: 150 })).toHaveLength(150);
    });
});
