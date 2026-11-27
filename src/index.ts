// Public API. Everything not exported here is internal.
export { projectPortfolio } from "./engine/project";
export type { ProjectionInput } from "./engine/input";
export type {
    ProjectionResult,
    ProjectionSummary,
    ProjectionYear,
} from "./engine/result";
export type { CashFlow, Contribution, Income } from "./topics/flows/types";
export type { Household, Person } from "./topics/household/types";
export type { Indexing } from "./core/indexing";
export { LIMITS } from "./core/limits";
