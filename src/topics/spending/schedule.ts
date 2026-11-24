import { amountInYear } from "../../core/growth";
import type { Assumptions } from "../assumptions/types";
import type { YearRef } from "../timeline/types";
import type { SpendingInput, SpendingSlice } from "./types";

export const spendingFor = (
    spending: SpendingInput,
    assumptions: Assumptions,
    yearref: YearRef,
): SpendingSlice => {
    const amt = amountInYear(
        spending.annual,
        assumptions.inflationRate,
        yearref.year,
    );
    return { spending: amt };
};
