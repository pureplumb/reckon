import { amountInYear } from "../../core/growth";
import type { YearRef } from "../timeline/types";
import type { SpendingInput, SpendingSlice } from "./types";

/** Spending in year `yearref`: the year-1 amount grown by inflation. */
export const spendingFor = (
    spending: SpendingInput,
    inflationRate: number,
    yearref: YearRef,
): SpendingSlice => ({
    spending: amountInYear(spending.annual, inflationRate, yearref.year),
});
