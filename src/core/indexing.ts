/** How an amount grows each year. */
export type Indexing = "inflation" | "none" | { rate: number };

/** The annual growth rate for an indexing mode. */
export const rateFor = (indexing: Indexing, inflationRate: number): number =>
    indexing === "inflation"
        ? inflationRate
        : indexing === "none"
        ? 0
        : indexing.rate;
