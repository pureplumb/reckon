import { expect } from "bun:test";
import type { ProjectionResult } from "@/index";

/**
 * Checks the two equations every year must satisfy (architecture.md §4), with
 * taxes = 0 and reinvested = surplus:
 *   income + withdrawal + shortfall = spending + surplus
 *   endBalance = startBalance + contributions + surplus - withdrawal + growth
 * Also checks the balance never goes negative and each year starts where the
 * last one ended.
 */
export const expectEquationsHold = ({ years }: ProjectionResult): void => {
    years.forEach((y, i) => {
        expect(y.income + y.withdrawal + y.shortfall).toBeCloseTo(
            y.spending + y.surplus,
            6,
        );
        expect(y.endBalance).toBeCloseTo(
            y.startBalance + y.contributions + y.surplus - y.withdrawal +
                y.growth,
            6,
        );
        expect(y.endBalance).toBeGreaterThanOrEqual(0);
        expect(y.shortfall).toBeGreaterThanOrEqual(0);
        expect(y.surplus).toBeGreaterThanOrEqual(0);
        if (i > 0) expect(y.startBalance).toBe(years[i - 1]!.endBalance);
    });
};
