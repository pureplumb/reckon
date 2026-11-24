import { validateAssumptions } from "../topics/assumptions/validate";
import { validateFlows } from "../topics/flows/validate";
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
    // After the timeline: flow years are checked against timeline.startYear.
    validateFlows(input.flows ?? [], input.timeline);
};
