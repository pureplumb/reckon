import type { Timeline, YearRef } from "./types";

/** Every year of the projection, in order YearRefs. */
export const projectionYears = ({ startYear, years }: Timeline): YearRef[] =>
    Array.from({ length: years }, (_, i) => ({
        year: i + 1,
        calendarYear: startYear + i,
    }));
