import { describe, expect, test } from "bun:test";
import { agesFor, birthYearsOf } from "@/topics/household/schedule";

const household = { people: [{ id: "pat", birthYear: 1960 }, { id: "sam", birthYear: 1963 }] };

describe("agesFor", () => {
    test("each person's age is calendarYear - birthYear", () => {
        expect(agesFor(household, { year: 2, calendarYear: 2027 })).toEqual({ ages: { pat: 67, sam: 64 } });
    });

    test("no household gives no ages", () => {
        expect(agesFor(undefined, { year: 1, calendarYear: 2026 })).toEqual({ ages: {} });
    });
});

describe("birthYearsOf", () => {
    test("birth years keyed by id; {} with no household", () => {
        expect(birthYearsOf(household)).toEqual({ pat: 1960, sam: 1963 });
        expect(birthYearsOf(undefined)).toEqual({});
    });
});
