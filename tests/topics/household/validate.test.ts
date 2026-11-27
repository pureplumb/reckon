import { describe, expect, test } from "bun:test";
import { validateHousehold } from "@/topics/household/validate";
import type { Household, Person } from "@/topics/household/types";

const startYear = 2026;
const pat: Person = { id: "pat", birthYear: 1960 };
const sam: Person = { id: "sam", birthYear: 1963 };

/** Validates [pat, sam] with person 1 (sam) changed. */
const check = (o: Partial<Person>) => () =>
    validateHousehold({ people: [pat, { ...sam, ...o }] }, startYear);

describe("validateHousehold", () => {
    test("one or two people do not throw", () => {
        expect(() => validateHousehold({ people: [pat] }, startYear)).not.toThrow();
        expect(() => validateHousehold({ people: [pat, sam] }, startYear)).not.toThrow();
    });

    test.each<[Household, string]>([
        [{ people: [] }, "household.people must have 1 or 2 entries, got 0"],
        [{ people: [pat, sam, { id: "x", birthYear: 1990 }] }, "household.people must have 1 or 2 entries, got 3"],
    ])("rejects %p", (h, message) => {
        expect(() => validateHousehold(h, startYear)).toThrow(RangeError);
        expect(() => validateHousehold(h, startYear)).toThrow(message);
    });

    const birthYearRule =
        "household.people[1].birthYear must be a whole number giving an age at timeline.startYear (2026) from 0 to 120, got";

    test.each<[Partial<Person>, string]>([
        [{ id: "" }, 'household.people[1].id must be a non-empty string, got ""'],
        [{ id: "pat" }, 'household.people[1].id must be unique, got "pat" (also household.people[0].id)'],
        [{ birthYear: 2027 }, `${birthYearRule} 2027`], // born after the projection starts
        [{ birthYear: 1905 }, `${birthYearRule} 1905`], // 121 at startYear
        [{ birthYear: 196 }, `${birthYearRule} 196`], // typo for 1960
        [{ birthYear: 1960.5 }, `${birthYearRule} 1960.5`],
        [{ birthYear: NaN }, `${birthYearRule} NaN`],
    ])("rejects %p", (o, message) => {
        expect(check(o)).toThrow(RangeError);
        expect(check(o)).toThrow(message);
    });

    test.each<Partial<Person>>([
        { birthYear: 2026 }, // age 0
        { birthYear: 1906 }, // age 120
        { id: "Pat" }, // ids are compared exactly
    ])("accepts %p", (o) => {
        expect(check(o)).not.toThrow();
    });
});
