import { checkRange } from "../../core/check";
import type { SpendingInput } from "./types";

export const validateSpending = (s: SpendingInput): void => {
    checkRange(
        Number.isFinite(s.annual) && s.annual >= 0,
        `spending.annual must be >= 0, got ${s.annual}`,
    );
};
