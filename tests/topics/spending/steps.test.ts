import { describe, expect, test } from "bun:test";
import { withdrawForSpending } from "@/topics/spending/steps";

const state = (balance: number) => ({ accounts: { default: balance } });

describe("withdrawForSpending", () => {
    test("need covered: withdraws spending minus income", () => {
        const s = state(1_000);
        expect(withdrawForSpending(s, 100, 30)).toEqual({
            withdrawal: 70,
            shortfall: 0,
            surplus: 0,
        });
        expect(s.accounts.default).toBe(930);
    });

    test("need partly covered: the rest is shortfall", () => {
        const s = state(50);
        expect(withdrawForSpending(s, 100, 30)).toEqual({
            withdrawal: 50,
            shortfall: 20,
            surplus: 0,
        });
        expect(s.accounts.default).toBe(0);
    });

    test("income above spending: surplus, no withdrawal", () => {
        const s = state(1_000);
        expect(withdrawForSpending(s, 100, 130)).toEqual({
            withdrawal: 0,
            shortfall: 0,
            surplus: 30,
        });
        expect(s.accounts.default).toBe(1_000);
    });

    test("income equal to spending: nothing moves", () => {
        expect(withdrawForSpending(state(0), 100, 100)).toEqual({
            withdrawal: 0,
            shortfall: 0,
            surplus: 0,
        });
    });
});
