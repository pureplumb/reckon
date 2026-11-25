import type { Assumptions } from "../topics/assumptions/types";
import type { CashFlow } from "../topics/flows/types";
import type { Portfolio } from "../topics/portfolio/types";
import type { SpendingInput } from "../topics/spending/types";
import type { Timeline } from "../topics/timeline/types";
import type { Household } from "../topics/household/types";

/**
 * Input to projectPortfolio, grouped by topic (design/architecture.md).
 * Each group's type is owned by its topic module.
 */
export interface ProjectionInput {
    timeline: Timeline;
    assumptions: Assumptions;
    portfolio: Portfolio;
    spending: SpendingInput;
    flows?: CashFlow[];
    household?: Household; // optional; see Decision 3
}
