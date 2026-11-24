import type { SimState } from "@/core/state";
import { withdrawUpTo } from "@/core/state";

export interface WithdrawSpendingResults {
    withdrawal: number;
    shortfall: number;
    surplus: number;
}

/**
 * Calculate how much to withdraw based on spending and income.
 * @param state
 * @param spending
 * @param income
 * @returns
 */
export const withdrawForSpending = (
    state: SimState,
    spending: number,
    income: number,
): WithdrawSpendingResults => {
    const need = spending - income;
    const withdrawal = need > 0 ? withdrawUpTo(state, need) : 0;
    return {
        withdrawal,
        shortfall: Math.max(need, 0) - withdrawal,
        surplus: Math.max(-need, 0), // income above spending; see Decision 2
    };
};
