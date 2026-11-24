import type { Assumptions } from "../topics/assumptions/types";
import type { CashFlow } from "../topics/flows/types";
import type { Portfolio } from "../topics/portfolio/types";
import type { SpendingInput } from "../topics/spending/types";
import type { Timeline } from "../topics/timeline/types";

/**
 * Input to projectPortfolio, composed from each topic's fields.
 * Flat for now; stage 2 groups it by topic (design/cash-flows.md, Decision 7).
 */
//export interface ProjectionInput
//    extends Timeline, Assumptions, Portfolio, SpendingInput {
//    flows?: CashFlow[]; // stage 2: not used yet
//}
export interface ProjectionInput {
    timeline: Timeline;
    assumptions: Assumptions;
    portfolio: Portfolio;
    spending: SpendingInput;
    flows?: CashFlow[];
}
