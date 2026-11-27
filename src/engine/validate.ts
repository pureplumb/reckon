import { validateAssumptions } from "../topics/assumptions/validate";
import { validateFlows } from "../topics/flows/validate";
import { birthYearsOf } from "../topics/household/schedule";
import { validateHousehold } from "../topics/household/validate";
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
    // After the timeline: birth years and flow years are checked against
    // timeline.startYear. Flows come last: they refer to the household's people.
    if (input.household) {
        validateHousehold(input.household, input.timeline.startYear);
    }
    validateFlows(
        input.flows ?? [],
        input.timeline,
        birthYearsOf(input.household),
    );
};
