import type { ProjectionInput } from "./input";
import type { ProjectionResult } from "./result";
import { simulate } from "./simulate";
import { validateProjectionInput } from "./validate";

/** Validates the input, then projects the portfolio year by year. */
export const projectPortfolio = (input: ProjectionInput): ProjectionResult => {
    validateProjectionInput(input);
    // Stage 2: const schedule = buildSchedule(input); then simulate(input, schedule)
    return simulate(input);
};
