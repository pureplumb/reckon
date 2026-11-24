/** The spending input group. */
export interface SpendingInput {
    annual: number; // year-1 amount in today's dollars, >= 0
}

/** The fields the spending topic adds to each schedule row. */
export interface SpendingSlice {
    spending: number; // inflation-adjusted spending target for the year
}
