import type { Indexing } from "../../core/indexing";

// Fields shared by every kind of flow. Never used on its own.
export interface FlowBase {
    id: string; // unique; used in per-flow output and error messages
    amount: number; // >= 0, in year-1 (today's) dollars; see Decision 5
    fromYear?: number; // first active calendar year, inclusive; default: startYear; see Decision 6
    toYear?: number; // last active calendar year, inclusive; default: last projection year
}

export interface Contribution extends FlowBase {
    type: "contribution";
    indexing?: Indexing; // default "none"; see Decision 1
}

export interface Income extends FlowBase {
    type: "income";
    source: "pension" | "socialSecurity" | "other";
    indexing: Indexing; // required; see Decision 1
}

export type CashFlow = Contribution | Income;

/** The fields the flows topic adds to each schedule row. */
export interface FlowsSlice {
    income: number; // sum of active income flows
    contributions: number; // sum of active contribution flows
    flows: Record<string, number>; // each flow's amount, keyed by id
}
