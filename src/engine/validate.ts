import { validateAssumptions } from "../topics/assumptions/validate";
import { validatePortfolio } from "../topics/portfolio/validate";
import { validateSpending } from "../topics/spending/validate";
import { validateTimeline } from "../topics/timeline/validate";
import type { ProjectionInput } from "./input";

/** Runs each topic's checks; throws a RangeError on the first failure. */
export const validateProjectionInput = (input: ProjectionInput): void => {
    validatePortfolio(input.portfolio);
    validateAssumptions(input.assumptions);
    validateSpending(input.spending);
    validateTimeline(input.timeline);
};
