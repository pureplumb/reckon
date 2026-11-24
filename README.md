# Reckon

Reckon is a TypeScript library for retirement planning. It projects a
portfolio year by year, from a starting balance, an expected return,
inflation, annual spending, and money coming in (income such as a pension or
Social Security, and contributions such as savings). For each year it shows
the balance, how much was withdrawn, and any spending the plan couldn't cover.

It is a calculation engine, not an app: plain data in, plain data out. No
I/O, no clock, no randomness, so the same input always gives the same result.
A UI or API can be built on top of it.

**Status:** pre-1.0. Stages 0–2 are built: the core projection, input
validation, and cash flows (income and contributions). Accounts and taxes,
age-based rules, spending guardrails and Monte Carlo are planned; see the
[roadmap](design/README.md#roadmap). The API may still change between stages.

## How it works

`projectPortfolio(input)` runs three steps:

```
input ──► validate ──► buildSchedule ──► simulate ──► result
```

1. **Validate.** Guard checks reject input that would make the projection
   meaningless (`NaN`, a rate of `5` meant as 5%, 10⁹ years). A failure throws
   a `RangeError` naming the field, e.g.
   `flows[1].amount must be >= 0, got -5`.
2. **Build the schedule.** Everything known in advance, worked out for each
   year: the inflation-adjusted spending target, and each income and
   contribution flow's amount in the years it is active.
3. **Simulate.** Walks the schedule with the balance. All money moves at the
   start of the year, before growth:
   1. deposit contributions
   2. use income to pay for spending, and withdraw the rest from the
      portfolio, up to what's there; anything still unpaid is a **shortfall**
   3. reinvest income above spending (**surplus**)
   4. grow the balance by the return rate

A few conventions to know:

- **Rates are decimals:** `0.05` means 5%.
- **Input amounts are in today's dollars** (year 1) and grow each year with
  inflation, or as the flow's `indexing` says. Output amounts are nominal
  (dollars of that year), except fields ending in `Real`, which are in today's
  dollars.
- **Years:** `fromYear` and `toYear` on a flow are calendar years (`2028`).
  `year` in the output is the 1-based projection year.
- **The output always has one row per year**, even after the money runs out,
  so later income or contributions can rebuild the balance.

The full details are in [design/projection.md](design/projection.md).

## Usage

Requires [Bun](https://bun.com). The library isn't published to a package
registry yet, so use it from this repository:

```bash
bun install
```

```ts
import { projectPortfolio, type ProjectionInput } from "./src/index";

const input: ProjectionInput = {
  timeline: { startYear: 2026, years: 4 },
  assumptions: { returnRate: 0.05, inflationRate: 0.03 },
  portfolio: { startBalance: 500_000 },
  spending: { annual: 60_000 },
  flows: [
    // $20k pension, flat, every year
    { id: "pension", type: "income", source: "pension", amount: 20_000, indexing: "none" },
    // $24k Social Security in today's dollars, rising with inflation, from 2028
    { id: "ss", type: "income", source: "socialSecurity", amount: 24_000, indexing: "inflation", fromYear: 2028 },
    // $10k a year of savings until 2027
    { id: "savings", type: "contribution", amount: 10_000, toYear: 2027 },
  ],
};

const { years, summary } = projectPortfolio(input);
```

`summary` covers the whole projection:

```ts
{
  endBalance: 494113.26,
  endBalanceReal: 439013.23,   // in today's dollars
  totalWithdrawn: 119330.57,
  totalShortfall: 0,
  totalIncome: 131687.05,
  totalContributions: 20000,
  firstShortfallYear: null,    // first year spending wasn't fully covered
}
```

`years` has one row per year. Year 3 (2028), when Social Security starts:

```ts
{
  year: 3, calendarYear: 2028,
  spending: 63654, income: 45461.6, contributions: 0,
  flows: { pension: 20000, ss: 25461.6, savings: 0 },
  startBalance: 484785, withdrawal: 18192.4, shortfall: 0, surplus: 0,
  growth: 23329.63, endBalance: 489922.23, endBalanceReal: 448348.24,
}
```

(Values are shown rounded; the library never rounds. Round only for display.)

### Input

| Field | Meaning |
|---|---|
| `timeline.startYear` | Calendar year of year 1 |
| `timeline.years` | Number of years to project, 1–150 |
| `assumptions.returnRate` | Nominal annual return, > -1 and ≤ 1 |
| `assumptions.inflationRate` | Annual inflation, > -1 and ≤ 1 |
| `portfolio.startBalance` | Starting balance, ≥ 0 |
| `spending.annual` | Spending in year 1, in today's dollars; grows with inflation |
| `flows` | Optional list of income and contribution flows (below) |

Each flow has a unique `id`, an `amount` in today's dollars, and optional
`fromYear`/`toYear` (calendar years, inclusive; default: the whole
projection). `indexing` sets how it grows: `"inflation"`, `"none"`, or
`{ rate: 0.02 }`.

- **`type: "income"`** pays for spending before anything is withdrawn. Needs a
  `source` (`"pension"`, `"socialSecurity"` or `"other"`) and an explicit
  `indexing`.
- **`type: "contribution"`** is deposited into the portfolio. `indexing`
  defaults to `"none"`.

All rules and error messages are in
[design/validation.md](design/validation.md). The exported `LIMITS` gives
the numeric limits, so a UI can check values with the same limits.

### Public API

Everything is exported from `src/index.ts`:

- `projectPortfolio(input): ProjectionResult`
- Types: `ProjectionInput`, `ProjectionResult`, `ProjectionYear`,
  `ProjectionSummary`, `CashFlow`, `Contribution`, `Income`, `Indexing`
- `LIMITS`: numeric limits used by validation

## Development

```bash
bun test     # run the tests
bun check    # type check
bun fmt      # format
```

```
src/
  index.ts      public API
  core/         shared helpers: growth, validation checks, balance state
  topics/       one folder per topic (timeline, assumptions, portfolio,
                spending, flows): its types, validation, schedule and steps
  engine/       wires the topics together: validate, schedule, simulate
tests/          mirrors src/
design/         design docs
```

The design docs explain how and why the engine is built the way it is.
Start with [design/README.md](design/README.md):

- [projection.md](design/projection.md): inputs, outputs and the yearly
  algorithm
- [validation.md](design/validation.md): input rules and error messages
- [architecture.md](design/architecture.md): code structure, and the checklist
  for adding a stage
- [decisions.md](design/decisions.md): why each finished stage was designed
  the way it was
- [drafts/](design/drafts/): stages being designed
