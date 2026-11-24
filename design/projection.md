# Projection Engine

**Status:** Implemented (through stage 2, cash flows). Input is checked first;
see [validation.md](validation.md). The engine's structure is in
[architecture.md](architecture.md).

Projects a retirement portfolio year by year. Given a starting balance, rate of
return, inflation rate, annual spending, and optional cash flows (income and
contributions), it shows how the portfolio performs over a number of years.
Later stages (age, accounts, taxes, etc.) are listed in the
[roadmap](README.md#roadmap).

## Principles

- **Pure functions:** plain JSON-serializable input in, plain JSON output.
  No I/O, no clock, no randomness.
- **Deterministic:** the same input always gives the same output.
- **Rates are decimals:** `0.05` means 5%.
- **Money is a `number` in dollars.** Don't round inside the calculation;
  round only when displaying.
- **Amounts are nominal by default:** all amounts are nominal (dollars of that
  year) unless the name ends in `Real`, which means year-0 dollars. Input
  amounts (`spending.annual`, a flow's `amount`) are stated in today's
  (year-1) dollars and grown to each year's nominal amount.

## API

```ts
// src/index.ts (public API); implemented in src/engine/project.ts
export function projectPortfolio(input: ProjectionInput): ProjectionResult;
```

`projectPortfolio` validates the input, builds the schedule, then simulates
(see [Algorithm](#algorithm)).

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
    startBalance: number;   // >= 0
  };
  spending: {
    annual: number;         // year-1 amount in today's dollars, >= 0; grows with inflation
  };
  flows?: CashFlow[];       // income and contributions
}

type Indexing = "inflation" | "none" | { rate: number };

interface FlowBase {
  id: string;            // unique; keys the per-flow output
  amount: number;        // >= 0, in year-1 (today's) dollars
  fromYear?: number;     // first active calendar year, inclusive; default: startYear
  toYear?: number;       // last active calendar year, inclusive; default: last projection year
}

interface Contribution extends FlowBase {
  type: "contribution";  // deposited into the portfolio
  indexing?: Indexing;   // default "none"
}

interface Income extends FlowBase {
  type: "income";        // pays for spending before any withdrawal
  source: "pension" | "socialSecurity" | "other";
  indexing: Indexing;    // required
}

type CashFlow = Contribution | Income;
```

Allowed ranges for each field are in [validation.md](validation.md#rules).

A flow is active in calendar years `fromYear` to `toYear`. In an active year
its amount is `amount * (1 + g)^(year - 1)`, where `g` is `inflationRate` for
`"inflation"`, 0 for `"none"`, or the given rate. Like `spending`, it grows
from year 1, so a flow starting in year 10 with `"inflation"` pays `amount` in
today's dollars. Outside its active years it is 0.

Example (the worked example below):

```ts
projectPortfolio({
  timeline: { startYear: 2026, years: 4 },
  assumptions: { returnRate: 0.05, inflationRate: 0.03 },
  portfolio: { startBalance: 500_000 },
  spending: { annual: 60_000 },
  flows: [
    { id: "pension", type: "income", source: "pension", amount: 20_000, indexing: "none" },
    { id: "ss", type: "income", source: "socialSecurity", amount: 24_000, indexing: "inflation", fromYear: 2028 },
    { id: "savings", type: "contribution", amount: 10_000, indexing: "none", toYear: 2027 },
  ],
});
```

### Output

Each row is the year's schedule row plus what the simulation adds:

```ts
interface ProjectionYear {
  // from the schedule
  year: number;            // 1-based projection year
  calendarYear: number;    // startYear + year - 1
  spending: number;        // inflation-adjusted spending target
  income: number;          // sum of active income flows
  contributions: number;   // sum of active contribution flows
  flows: Record<string, number>; // each flow's amount, keyed by id (0 when inactive)
  // from the simulation
  startBalance: number;
  withdrawal: number;      // taken from the portfolio for spending
  shortfall: number;       // spending not covered by income or withdrawals
  surplus: number;         // income above spending, reinvested
  growth: number;          // investment return earned this year
  endBalance: number;      // nominal
  endBalanceReal: number;  // in year-0 dollars: endBalance / (1 + inflation)^year
}

interface ProjectionSummary {
  endBalance: number;
  endBalanceReal: number;
  totalWithdrawn: number;
  totalShortfall: number;
  totalIncome: number;
  totalContributions: number;
  firstShortfallYear: number | null; // first year spending wasn't fully covered, else null
}

interface ProjectionResult {
  years: ProjectionYear[];
  summary: ProjectionSummary;
}
```

## Algorithm

The engine runs in two stages (see [architecture.md](architecture.md)):

1. **`buildSchedule`** (`src/engine/schedule.ts`) works out everything fixed by
   the input, one row per year: the year, the spending target, and each flow's
   amount with the income and contribution totals.
2. **`simulate`** (`src/engine/simulate.ts`) walks the schedule with the
   balance, running each year's steps in a fixed order, then calculates the
   summary from the finished rows.

All money moves at the **start** of the year, before growth. Each year:

```
startBalance = balance
balance     += contributions                      # 1. deposit contributions
need         = spending - income                  # 3. withdraw for spending
withdrawal   = need > 0 ? min(need, balance) : 0
shortfall    = max(need, 0) - withdrawal
surplus      = max(-need, 0)
balance     += surplus - withdrawal               # 4. reinvest surplus
growth       = balance * returnRate               # 5. grow
balance     += growth
endBalance   = balance
```

(Step 2, RMDs, arrives in stage 6.)

- Year 1 uses spending and flow amounts as given. Growth by inflation or
  indexing starts in year 2.
- Income pays for spending first; only the rest is withdrawn. Income above
  spending is reinvested as `surplus` and earns that year's return.
- Contributions are deposited first, so they can fund the same year's
  withdrawal, and earn that year's full return.
- Start-of-year withdrawals are the conservative convention: money spent
  doesn't earn that year's return.
- The withdrawal is capped at the balance, so the balance never goes negative.
  `shortfall` is exactly 0 when spending is covered, so `shortfall > 0` is a
  reliable test.
- Once the balance reaches 0, every step still runs, so the output always has
  `timeline.years` rows. Unfunded spending becomes shortfall, and later
  contributions or surplus can rebuild the balance.
- `firstShortfallYear` is the first year with `shortfall > 0`, even if the
  balance later recovers. A balance that reaches exactly 0 with spending
  covered is not a shortfall; the next year is.
- A negative return can shrink the balance but never makes it negative. With
  `startBalance: 0` and no money coming in, every year is short by the full
  spending target.

Every year satisfies the two equations in
[architecture.md](architecture.md#4-two-equations-every-year):

```
income + withdrawal + shortfall = spending + surplus
endBalance = startBalance + contributions + surplus - withdrawal + growth
```

### Worked example

$500,000, 5% return, 3% inflation, $60,000 spending, starting in 2026, with a
$20,000 pension (`"none"`, all years), $24,000 Social Security in today's
dollars (`"inflation"`, from 2028), and $10,000 contributions (`"none"`, to
2027):

| Year | Start      | Contributions | Spending  | Income    | Withdrawal | Growth    | End        | End (real) |
|------|------------|---------------|-----------|-----------|------------|-----------|------------|------------|
| 1    | 500,000.00 | 10,000.00     | 60,000.00 | 20,000.00 | 40,000.00  | 23,500.00 | 493,500.00 | 479,126.21 |
| 2    | 493,500.00 | 10,000.00     | 61,800.00 | 20,000.00 | 41,800.00  | 23,085.00 | 484,785.00 | 456,956.36 |
| 3    | 484,785.00 | 0.00          | 63,654.00 | 45,461.60 | 18,192.40  | 23,329.63 | 489,922.23 | 448,348.24 |
| 4    | 489,922.23 | 0.00          | 65,563.62 | 46,225.45 | 19,338.17  | 23,529.20 | 494,113.26 | 439,013.23 |

Year 3 income is the $20,000 pension plus $25,461.60 Social Security
($24,000 × 1.03²). There is no surplus or shortfall, so `firstShortfallYear`
is `null`.

Without flows: $1,000,000, 5% return, 3% inflation, $40,000 spending:

| Year | Start        | Withdrawal | Growth    | End          | End (real) |
|------|--------------|------------|-----------|--------------|------------|
| 1    | 1,000,000.00 | 40,000.00  | 48,000.00 | 1,008,000.00 | 978,640.78 |
| 2    | 1,008,000.00 | 41,200.00  | 48,340.00 | 1,015,140.00 | 956,866.81 |
| 3    | 1,015,140.00 | 42,436.00  | 48,635.20 | 1,021,339.20 | 934,670.05 |

## Breaking changes in stage 2

- Input grouped by topic: `startYear` → `timeline.startYear`, `returnRate` →
  `assumptions.returnRate`, `startBalance` → `portfolio.startBalance`, etc.
- `annualWithdrawal` renamed to `spending.annual`.
- `summary.depletedInYear` replaced by `summary.firstShortfallYear`. They can
  differ by one year: with $100, $50 a year and 0% return, year 2 withdraws the
  last $50 with spending covered, so the old field was 2 and the new one is 3.
- `portfolio.startBalance` may now be 0.

The reasons are in [cash-flows.md](cash-flows.md#decisions).

## Testing

Code layout is in [architecture.md](architecture.md#code-layout). Validation
tests are listed in [validation.md](validation.md#testing).

- `tests/engine/projectPortfolio.test.ts`, through the public API, without
  flows: the no-flows worked example; 0% return and 0% inflation; a portfolio
  that runs out (capped withdrawal, partial shortfall, zero-balance rows after
  it, `firstShortfallYear`, `totalShortfall`).
- `tests/engine/simulate.test.ts`: the cash-flow worked example and per-flow
  output; with no flows, every row matches the stage 1 engine; income equal to
  and above spending; contributions funding a same-year withdrawal; a $0
  start; recovery after depletion; `firstShortfallYear` staying at the first
  short year.
- Every projection in both files is checked against the two yearly equations
  by `tests/helpers/equations.ts`.
- Each schedule builder, year step and `summarize` is tested on its own under
  `tests/core/`, `tests/topics/` and `tests/engine/`.
