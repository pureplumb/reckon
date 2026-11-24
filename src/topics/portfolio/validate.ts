import { checkRange } from "../../core/check";
import type { Portfolio } from "./types";

export const validatePortfolio = (p: Portfolio): void => {
    checkRange(
        Number.isFinite(p.startBalance) && p.startBalance >= 0,
        `portfolio.startBalance must be >= 0, got ${p.startBalance}`,
    );
};
