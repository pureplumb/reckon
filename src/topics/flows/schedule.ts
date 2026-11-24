// Schedule builder for cash flows (design/projection.md#input). Used by
// engine/schedule.ts buildSchedule.
import { amountInYear } from "../../core/growth";
import { rateFor } from "../../core/indexing";
import type { Timeline, YearRef } from "../timeline/types";
import type { CashFlow, FlowsSlice } from "./types";

/** A flow's amount in year `y`: 0 outside its active calendar years. */
export const flowAmount = (
    cf: CashFlow,
    y: YearRef,
    timeline: Timeline,
    inflationRate: number,
): number => {
    const fromYear = cf.fromYear ?? timeline.startYear;
    const toYear = cf.toYear ?? timeline.startYear + timeline.years - 1;
    if (y.calendarYear < fromYear || y.calendarYear > toYear) return 0;

    const rate = rateFor(cf.indexing ?? "none", inflationRate);
    return amountInYear(cf.amount, rate, y.year);
};

/** Each flow's amount in year `y`, keyed by flow id. */
export const amounts = (
    flows: CashFlow[],
    y: YearRef,
    timeline: Timeline,
    inflationRate: number,
): Record<string, number> =>
    Object.fromEntries(
        flows.map((f) => [f.id, flowAmount(f, y, timeline, inflationRate)]),
    );

export const flowForYear = (
    flows: CashFlow[],
    y: YearRef,
    timeline: Timeline,
    inflationRate: number,
): FlowsSlice => {
    const records = amounts(flows, y, timeline, inflationRate);

    const TOTAL_FOR = {
        income: "income",
        contribution: "contributions",
    } as const satisfies Record<CashFlow["type"], "income" | "contributions">;

    const totals = { income: 0, contributions: 0 };
    for (const f of flows) totals[TOTAL_FOR[f.type]] += records[f.id]!;

    return {
        income: totals.income,
        contributions: totals.contributions,
        flows: records,
    };
};
