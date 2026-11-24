# Projection Engine

**Status:** Implemented. Input is checked first; see [validation.md](validation.md).

Projects a retirement portfolio year by year. Given a starting balance, rate of
return, inflation rate, and annual withdrawal, it shows how the portfolio
performs over a number of years. Later stages (contributions, income, taxes,
etc.) are listed in the [roadmap](README.md#roadmap).

## Principles

- **Pure functions:** plain JSON-serializable input in, plain JSON output.
  No I/O, no clock, no randomness.
- **Deterministic:** the same input always gives the same output.
- **Rates are decimals:** `0.05` means 5%.
- **Money is a `number` in dollars.** Don't round inside the calculation;
  round only when displaying.
- **Amounts are nominal by default:** all amounts are nominal (dollars of that
  year) unless the name ends in `Real`, which means year-0 dollars.

## API

```ts
// src/index.ts (public API); implemented in src/engine/project.ts
export function projectPortfolio(input: ProjectionInput): ProjectionResult;
```

### Input

Grouped by topic; each group is defined by its topic module (see
[architecture.md](architecture.md#code-layout)).

```ts
interface ProjectionInput {
  timeline: {
    startYear: number;      // calendar year of year 1
    years: number;          // whole number, 1 to 150
  };
  assumptions: {
    returnRate: number;     // nominal annual return, e.g. 0.05
    inflationRate: number;  // annual, e.g. 0.03
  };
  portfolio: {
    startBalance: number;   // > 0
  };
  spending: {
    annual: number;         // year-1 amount in today's dollars, >= 0
  };
  flows?: CashFlow[];       // stage 2, not used yet; see cash-flows.md
}
```

Allowed ranges for each field are in [validation.md](validation.md#rules).

Example (the worked example below):

```ts
projectPortfolio({
  timeline: { startYear: 2026, years: 3 },
  assumptions: { returnRate: 0.05, inflationRate: 0.03 },
  portfolio: { startBalance: 1_000_000 },
  spending: { annual: 40_000 },
});
```

### Output

```ts
interface ProjectionYear {
  year: number;            // 1-based index
  calendarYear: number;    // startYear + year - 1
  startBalance: number;
  withdrawal: number;      // actual amount taken (capped at available balance)
  shortfall: number;       // spending the portfolio couldn't cover: target - withdrawal
  growth: number;          // investment return earned this year
  endBalance: number;      // nominal
  endBalanceReal: number;  // in year-0 dollars: endBalance / (1 + inflation)^year
}

interface ProjectionResult {
  years: ProjectionYear[];
  summary: {
    endBalance: number;
    endBalanceReal: number;
    totalWithdrawn: number;
    totalShortfall: number;        // sum of shortfall across all years
    depletedInYear: number | null; // first year the balance hit 0, else null
  };
}
```

## Algorithm

Withdrawals happen at the **start** of each year, before growth. This is the
conservative convention: the money you spend doesn't earn that year's return.
The loop is in `src/engine/simulate.ts`.

```
balance = portfolio.startBalance
for year in 1..timeline.years:
    target     = spending.annual * (1 + inflationRate)^(year - 1)
    withdrawal = min(target, balance)
    shortfall  = target - withdrawal
    afterDraw  = balance - withdrawal
    growth     = afterDraw * returnRate
    endBalance = afterDraw + growth
    record year
    balance    = endBalance
```

- Year 1 uses the withdrawal as given. Inflation adjustments start in year 2.
- Once the balance reaches 0, the loop keeps running rather than exiting
  early, so the output always has `timeline.years` rows. `depletedInYear` marks the
  first year the balance hit 0.
  - In later years the balance, withdrawal and growth are 0, and `shortfall`
    equals the full inflation-adjusted target: the spending that went unfunded.
  - Keeping every year calculated leaves room for future extensions (income
    sources, taxes, RMDs) that still apply after the portfolio is empty.
- A negative return can shrink the balance but never makes it negative.
- With `spending.annual: 0` the balance simply compounds:
  `startBalance * (1 + returnRate)^years`. Because validation requires
  `portfolio.startBalance > 0` and `assumptions.returnRate > -1`, the balance
  can only reach 0 through withdrawals.

### Worked example

$1,000,000, 5% return, 3% inflation, $40,000 withdrawal:

| Year | Start        | Withdrawal | Growth    | End          | End (real) |
|------|--------------|------------|-----------|--------------|------------|
| 1    | 1,000,000.00 | 40,000.00  | 48,000.00 | 1,008,000.00 | 978,640.78 |
| 2    | 1,008,000.00 | 41,200.00  | 48,340.00 | 1,015,140.00 | 956,866.81 |
| 3    | 1,015,140.00 | 42,436.00  | 48,635.20 | 1,021,339.20 | 934,670.05 |

## Testing

Tests go in `tests/engine/projectPortfolio.test.ts`; code layout is in
[architecture.md](architecture.md#code-layout). Validation tests are listed in
[validation.md](validation.md#testing).
- With 0% return and 0% inflation the balance drops by exactly the withdrawal
  each year.
- The worked example above, matched with `toBeCloseTo`.
- A portfolio that runs out: check `depletedInYear`, the capped withdrawal
  and its partial shortfall, the zero-balance rows after it (each with a
  shortfall equal to the full target), and `totalShortfall`.
- A portfolio that never runs out has `shortfall` 0 in every year and
  `totalShortfall` 0.
