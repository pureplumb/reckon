import { deposit, type SimState } from "../../core/state";

/**
 * Increase account balance(s) based on any contributions.
 * This internally updates account state balance.
 *
 * @param state Account state
 * @param contributions Current total of contributions
 */
export const depositContributions = (
    state: SimState,
    contributions: number,
): void => {
    deposit(state, contributions);
};

/**
 * Reinvest any surplus based on the difference between `spending` and `income`
 * @param state Account state
 * @param surplus Total surplus for the year.
 */
export const reinvest = (state: SimState, surplus: number): void => {
    deposit(state, surplus);
};
