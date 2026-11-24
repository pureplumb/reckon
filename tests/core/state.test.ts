import { describe, expect, test } from "bun:test";
import { deposit, totalBalance, withdrawUpTo } from "@/core/state";

describe("totalBalance", () => {
    test("sums every account", () => {
        expect(totalBalance({ accounts: { default: 100, ira: 50 } })).toBe(150);
        expect(totalBalance({ accounts: {} })).toBe(0);
    });
});

describe("deposit", () => {
    test("adds to the default account, creating it if missing", () => {
        const state = { accounts: {} as Record<string, number> };
        deposit(state, 100);
        deposit(state, 25);
        expect(state.accounts).toEqual({ default: 125 });
    });
});

describe("withdrawUpTo", () => {
    test("takes the full amount when the balance covers it", () => {
        const state = { accounts: { default: 100 } };
        expect(withdrawUpTo(state, 40)).toBe(40);
        expect(state.accounts.default).toBe(60);
    });

    test("never takes more than the balance, and returns what it took", () => {
        const state = { accounts: { default: 30 } };
        expect(withdrawUpTo(state, 40)).toBe(30);
        expect(state.accounts.default).toBe(0);
        expect(withdrawUpTo(state, 10)).toBe(0);
        expect(state.accounts.default).toBe(0);
    });

    test("a negative amount takes nothing", () => {
        const state = { accounts: { default: 30 } };
        expect(withdrawUpTo(state, -5)).toBe(0);
        expect(state.accounts.default).toBe(30);
    });
});
