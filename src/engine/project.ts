import type { ProjectionInput } from "./input";
import type { ProjectionResult } from "./result";
import { buildSchedule } from "./schedule";
import { simulate } from "./simulate";
import { validateProjectionInput } from "./validate";

/** Validates the input, builds the schedule, then simulates year by year. */
export const projectPortfolio = (input: ProjectionInput): ProjectionResult => {
    validateProjectionInput(input);
    const schedule = buildSchedule(input);
    return simulate(input, schedule);
};
