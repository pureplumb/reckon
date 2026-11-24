import type { SimState } from "../../core/state";
import type { Portfolio } from "./types";

export const initialState = (portfolio: Portfolio): SimState => ({
    accounts: { default: portfolio.startBalance },
});

/**
 * Grow every account by the return rate.
 * @param state Account state
 * @param returnRate Rate of return
 * @returns the total growth across all accounts
 */
export const grow = (state: SimState, returnRate: number): number => {
    let growth = 0;
    for (const [id, balance] of Object.entries(state.accounts)) {
        const g = balance * returnRate;
        state.accounts[id] = balance + g;
        growth += g;
    }
    return growth;
};
