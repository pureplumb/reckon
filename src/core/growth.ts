/** Cumulative inflation factor after `years` years: (1 + rate)^years. */
export const inflationFactor = (rate: number, years: number): number =>
    (1 + rate) ** years;

/**
 * Value in projection year `year` of an amount stated in year-1 dollars that
 * grows at `rate` from year 1: amount * (1 + rate)^(year - 1).
 */
export const amountInYear = (
    amount: number,
    rate: number,
    year: number,
): number => amount * (1 + rate) ** (year - 1);
