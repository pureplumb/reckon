# Reckon

Reckon is a TypeScript library for retirement planning. It projects a
portfolio year by year, from a starting balance, an expected return,
inflation, annual spending, and money coming in (income such as a pension or
Social Security, and contributions such as savings). Flows can be dated by
calendar year or by the age of someone in the household ("Social Security
from 67"). For each year it shows the balance, how much was withdrawn, any
spending the plan couldn't cover, and each person's age.

It is a calculation engine, not an app: plain data in, plain data out. No
I/O, no clock, no randomness, so the same input always gives the same result.
A UI or API can be built on top of it.

**Status:** pre-1.0. Stages 0–3 are built: the core projection, input
validation, cash flows (income and contributions), and the household (one or
two people with birth years, so flows can start or stop at an age). Specific
income rules, spending guardrails, accounts and taxes, and Monte Carlo are
planned; see the
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
   year: the inflation-adjusted spending target, each income and
   contribution flow's amount in the years it is active, and each person's
   age.
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
- **Ages:** a person's age in a year is `calendarYear - birthYear`, the age
  they reach that year. `fromAge`/`toAge` on a flow become calendar years
  with `birthYear + age`.
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
  ages: {},   // no household in this example
  startBalance: 484785, withdrawal: 18192.4, shortfall: 0, surplus: 0,
  growth: 23329.63, endBalance: 489922.23, endBalanceReal: 448348.24,
}
```

(Values are shown rounded; the library never rounds. Round only for display.)

#### Dating flows by age

Add a `household`, and give a flow a `person` with `fromAge` or `toAge`
instead of `fromYear` or `toYear`:

```ts
const couple: ProjectionInput = {
  ...input,
  household: {
    people: [
      { id: "pat", birthYear: 1960 },   // 66 in 2026
      { id: "sam", birthYear: 1963 },   // 63 in 2026
    ],
  },
  flows: [
    // Pat claims Social Security at 67 → from 2027
    { id: "pat-ss", type: "income", source: "socialSecurity", amount: 32_000, indexing: "inflation", person: "pat", fromAge: 67 },
    // Pat's pension started at 60, before the projection → active from year 1
    { id: "pat-pension", type: "income", source: "pension", amount: 18_000, indexing: "none", person: "pat", fromAge: 60 },
    // Sam saves until 65 → 2026–2028
    { id: "sam-401k", type: "contribution", amount: 23_000, person: "sam", toAge: 65 },
  ],
};
```

Each row then has `ages`, e.g. `{ pat: 67, sam: 64 }` in 2027. With one
person in the household, `person` can be left out.

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
| `household.people` | Optional; 1 or 2 people, each `{ id, birthYear }` |

Each flow has a unique `id`, an `amount` in today's dollars, and optional
`fromYear`/`toYear` (calendar years, inclusive; default: the whole
projection). `indexing` sets how it grows: `"inflation"`, `"none"`, or
`{ rate: 0.02 }`. Instead of `fromYear`/`toYear` it can use `fromAge`/`toAge`
(inclusive) of its `person`, which must be in `household.people`; a flow
without `person` belongs to the household jointly.

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
  `ProjectionSummary`, `CashFlow`, `Contribution`, `Income`, `Indexing`,
  `Household`, `Person`
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
                spending, flows, household): its types, validation,
                schedule and steps
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
