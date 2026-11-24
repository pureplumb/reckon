/**
 * Container for state passed through the simulator
 */
export interface SimState {
    accounts: Record<string, number>; // balance per account id
}

/**
 * Calculate the total balance across all accounts
 * @param state All accounts
 * @returns The total balance
 */
export const totalBalance = (state: SimState): number => {
    return Object.values(state.accounts).reduce((t, b) => t + b, 0);
};

/**
 * Update state by depositing `amount` to the accounts(s)
 * NOTE: At this state it's only adding to the default account.
 * That will change in later stages
 * @param state All accounts
 * @param amount The amount to deposit
 * @returns
 */
export const deposit = (state: SimState, amount: number): void => {
    const current = state.accounts.default ?? 0;
    state.accounts.default = current + amount;
};

/**
 * Withdraw `amount` from the account balance.
 * @param state Accounts
 * @param amount The amount to withdraw
 * @returns The amount taken
 */
export const withdrawUpTo = (state: SimState, amount: number): number => {
    const current = state.accounts.default ?? 0;
    const taken = Math.min(Math.max(amount, 0), current);
    state.accounts.default = current - taken;
    return taken;
};
