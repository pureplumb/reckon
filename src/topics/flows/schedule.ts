// Schedule builder for cash flows (design/projection.md#input). Used by
// engine/schedule.ts buildSchedule.
import { amountInYear } from "../../core/growth";
import { rateFor } from "../../core/indexing";
import type { Timeline, YearRef } from "../timeline/types";
import type { CashFlow, FlowsSlice } from "./types";

/**
 * A flow's first and last active calendar years. Ages are converted with
 * `birthYear + age` for the flow's `person`, or the only person when there is
 * one (Decision 4); validation guarantees one of them exists when an age is
 * given. Defaults: startYear and the last projection year.
 */
export const activeYears = (
    cf: CashFlow,
    timeline: Timeline,
    birthYears: Record<string, number>,
): { fromYear: number; toYear: number } => {
    const who = cf.person ?? Object.keys(birthYears)[0]!;
    const yearOf = (age: number) => birthYears[who]! + age;
    return {
        fromYear: cf.fromYear ??
            (cf.fromAge !== undefined ? yearOf(cf.fromAge) : timeline.startYear),
        toYear: cf.toYear ??
            (cf.toAge !== undefined
                ? yearOf(cf.toAge)
                : timeline.startYear + timeline.years - 1),
    };
};

/** A flow's amount in year `y`: 0 outside its active calendar years. */
export const flowAmount = (
    cf: CashFlow,
    y: YearRef,
    timeline: Timeline,
    inflationRate: number,
    birthYears: Record<string, number> = {},
): number => {
    // A fromAge before the projection gives a fromYear before startYear, so
    // the flow is active from year 1 with no special case.
    const { fromYear, toYear } = activeYears(cf, timeline, birthYears);
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
    birthYears: Record<string, number> = {},
): Record<string, number> =>
    Object.fromEntries(
        flows.map((f) => [
            f.id,
            flowAmount(f, y, timeline, inflationRate, birthYears),
        ]),
    );

/**
 * The flows slice for year `y`. `birthYears` (person id → birth year, {} with
 * no household) resolves fromAge/toAge; see Decision 5b.
 */
export const flowForYear = (
    flows: CashFlow[],
    y: YearRef,
    timeline: Timeline,
    inflationRate: number,
    birthYears: Record<string, number> = {},
): FlowsSlice => {
    const records = amounts(flows, y, timeline, inflationRate, birthYears);

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
