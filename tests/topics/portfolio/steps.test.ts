import { describe, expect, test } from "bun:test";
import { grow, initialState } from "@/topics/portfolio/steps";

test("initialState puts the start balance in the default account", () => {
    expect(initialState({ startBalance: 500 })).toEqual({
        accounts: { default: 500 },
    });
});

describe("grow", () => {
    test("applies the return to every account and returns the total growth", () => {
        const state = { accounts: { default: 1_000, ira: 500 } };
        expect(grow(state, 0.1)).toBeCloseTo(150);
        expect(state.accounts.default).toBeCloseTo(1_100);
        expect(state.accounts.ira).toBeCloseTo(550);
    });

    test("a negative return gives negative growth", () => {
        const state = { accounts: { default: 1_000 } };
        expect(grow(state, -0.5)).toBe(-500);
        expect(state.accounts.default).toBe(500);
    });

    test("a $0 balance does not grow", () => {
        const state = { accounts: { default: 0 } };
        expect(grow(state, 0.1)).toBe(0);
        expect(state.accounts.default).toBe(0);
    });
});
