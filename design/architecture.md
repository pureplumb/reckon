# Architecture

**Status:** Draft. Introduced by stage 2 ([cash-flows.md](cash-flows.md));
becomes Implemented when stage 2 is built.

How the projection engine is structured so that each stage adds a separate
piece (an input group, a schedule builder, a year step) instead of growing one
input type, one function and one loop. Applies to every stage from stage 2 on.

## Overview

```
ProjectionInput ──► validate ──► buildSchedule ──► simulate ──► ProjectionResult
 (grouped by          (per         (per-topic        (year steps
  topic)              group)        builders)         in fixed order)
```

`projectPortfolio()` is the public function and calls the three in order.

## Topic modules

Each topic lives in its own module under `src/projection/` and owns
everything about that topic:

| Part | Example for cash flows |
|---|---|
| Its input group type | `CashFlow`, `Contribution`, `Income` |
| Its validation | flow `id`, `amount`, `fromYear`/`toYear` checks |
| Its schedule builder | per-year amounts and totals for each flow |
| Its year step(s), if it moves money | depositing contributions |

`projectPortfolio`, `buildSchedule` and `simulate` only wire the topics
together; they contain no topic logic.

| Topic | Module | Stage |
|---|---|---|
| Timeline and assumptions | `timeline.ts` | 0 |
| Spending | `spending.ts` | 2 (stage 5 extends it) |
| Cash flows | `flows.ts` | 2 |
| Household (ages) | `household.ts` | 3 |
| Accounts | `accounts.ts` | 6 |
| Taxes and RMDs | `tax.ts` | 6 |

## 1. Input grouped by topic

Each stage adds a group, or fields inside its own group, rather than fields at
the top level:

```ts
interface ProjectionInput {
  timeline:    { startYear: number; years: number };
  assumptions: { returnRate: number; inflationRate: number };
  portfolio:   { startBalance: number };  // stage 6: { accounts: Account[] }
  spending:    { annual: number };        // stage 5: essential, discretionary, guardrails
  flows?:      CashFlow[];
  // stage 3:  household: { birthYear: number; ... }
  // stage 6:  tax: { ... }
}
```

- A topic's fields stay together, so its module can validate and read its own
  group without knowing about the rest.
- Validation messages name the full path, e.g.
  `timeline.years must be a whole number in the range 1-150, got 0`.
- A group starts small even if it holds one field (`spending: { annual }`), so
  that later fields are added inside it without a breaking change.

## 2. The schedule: everything known in advance

**Rule:** anything that can be known before the simulation runs goes in the
schedule; anything that depends on the portfolio goes in `simulate`. The
schedule holds the planned amounts, and `simulate` can adjust them as the
portfolio changes.

`buildSchedule` produces one row per year by combining a slice from each
topic's builder:

```ts
const buildSchedule = (input: ProjectionInput): ScheduleYear[] =>
  projectionYears(input).map((y) => ({
    ...timelineFor(input, y),   // year, calendarYear
    ...spendingFor(input, y),   // spending
    ...flowsFor(input, y),      // income, contributions, flows
    // stage 6: ...rmdPercentFor(input, y), ...returnRatesFor(input, y)
  }));
```

Each builder is a plain function returning its own fields, so the combined
`ScheduleYear` type is checked by TypeScript, and each builder can be tested
on its own.

### What goes where

Some planned features look like schedule items but belong in `simulate`:

| Feature | Where | Why |
|---|---|---|
| Spending, income, contributions (stage 2) | schedule | Fixed by the input |
| Social Security claiming age, pension start (stages 3–4) | schedule | Fixed by dates and ages |
| Return rate per year and per account (stages 6–7) | schedule | Fixed by the input or a generated sequence |
| RMD percentage (stage 6) | schedule | Fixed by age and the IRS table |
| Account balances (stage 6) | `simulate` | Each year's withdrawal is capped by the balance, which depends on earlier withdrawals |
| RMD amount (stage 6) | `simulate` | The percentage × last year-end balance |
| Taxes (stage 6) | `simulate` | Depend on how much is withdrawn, and from which account |
| Spending guardrails (stage 5) | `simulate` | Cut spending after a bad year |

## 3. Simulation: year steps in a fixed order

`simulate` keeps balances in a state object keyed by account (a single
`default` account until stage 6):

```ts
interface SimState {
  accounts: Record<string, number>;  // balance per account id
}
```

Each year runs a fixed sequence of small, named steps. Each step is a plain
function that reads the year's schedule row and updates the year's working
values and the state. `simulate` is still pure from the outside: it creates
its own state and shares nothing.

| Order | Step | Stage | Does |
|---|---|---|---|
| 1 | `depositContributions` | 2 | Adds the year's contributions to the portfolio |
| 2 | `takeRmds` | 6 | Forced withdrawals from traditional accounts. Before step 3 because RMDs count toward spending |
| 3 | `withdrawForSpending` | 2 | `need = spending - income` (stage 6: minus RMDs, plus taxes); withdraws up to the balance; records shortfall. Stage 6 adds withdrawal order and the tax gross-up here |
| 4 | `reinvest` | 2 | Puts income above spending (surplus) back in. Stage 6: also excess RMDs |
| 5 | `grow` | 2 | Applies the return. Stage 6: per account |

**The order is part of the design.** Each stage doc says where its steps go
and why. Steps are called directly in this order: no plugin or middleware
system, which would hide the order.

All money moves at the start of the year, before growth (steps 1–4 before
step 5).

## 4. Two equations every year

Every year must satisfy two equations. They are the core rule every stage
follows, and the tests check them on **every row of every projection**, which
catches mistakes in how features interact (for example an RMD counted twice).

**Household cash: money in equals money out.**

```
income + withdrawals + shortfall = spending + taxes + reinvested
```

**Portfolio: the balance moves only by the year's flows and growth.**

```
endBalance = startBalance + contributions + reinvested - withdrawals + growth
```

| Term | Stage 2 | Stage 6 adds |
|---|---|---|
| `withdrawals` | the withdrawal for spending | RMDs; the tax gross-up |
| `taxes` | 0 | tax on income and withdrawals |
| `reinvested` | surplus | excess RMDs |

- **`spending` always means what is spent on living.** Taxes and RMDs change
  how much comes out of the portfolio, not what is spent.
- **`shortfall` always means spending that wasn't funded**, never unpaid tax.
- Contributions are not household cash in this model: they come from outside
  (e.g. wages) and go straight into the portfolio, so they appear only in the
  portfolio equation.

## 5. Output

- Totals stay as they are (`startBalance`, `endBalance`, `endBalanceReal`,
  `withdrawal`), summed across accounts.
- Rows will widen as stages add fields. Group them (`row.balances`,
  `row.cash`) when stage 6 adds per-account fields, not before.

## Adding a stage: checklist

Each stage doc must say:

1. **Input:** which group it adds, or which fields it adds inside a group.
2. **Validation:** the rules for its group.
3. **Schedule:** which builder or fields it adds, and why they are known in
   advance.
4. **Simulation:** which year steps it adds or changes, and where they go in
   the order.
5. **Equations:** how it changes the two yearly equations.
6. **Output:** new fields on rows and the summary.
7. **Breaking changes**, if any.

## Not doing

- **A plugin or middleware system for steps.** The steps are known and their
  order matters; plain function calls keep the order visible.
- **Generic schedule merging** (e.g. a `mergeByYear` over arbitrary builders).
  Spreading each builder's slice into the row is enough and keeps the types
  simple.
