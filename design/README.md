# Design Docs

## How these docs work

There are two kinds of doc:

- **Reference docs** describe how the library works now. They are updated
  whenever a stage changes behaviour, so reading one never requires replaying
  history.
- **Stage docs** propose one stage of development: the problem, the design,
  the decisions and why they were made, and the changes it will make to the
  reference docs. Once a stage is implemented, its changes are merged into the
  reference docs, and the stage doc stays as the record of why.

Every doc has a status line:

| Status | Meaning |
|---|---|
| Draft | Under discussion; nothing is decided |
| Approved | Design agreed; not yet built |
| Implemented | Built; reference docs updated to match |

Reference docs change only once a design is approved.

## Reference docs

| Doc | Covers | Status |
|---|---|---|
| [projection.md](projection.md) | Core engine: inputs, outputs, the yearly algorithm | Implemented |
| [validation.md](validation.md) | Guard checks on input, and the limits exported for clients | Implemented |

## Roadmap

The library is pre-1.0 with no outside callers, so a stage may change the API
when that gives a better design. Each stage doc lists any breaking changes.

| # | Stage | Doc | Status |
|---|---|---|---|
| 0 | Core projection: compounding, inflation, withdrawals, real vs nominal | [projection.md](projection.md) | Implemented |
| 1 | Input validation | [validation.md](validation.md) | Implemented |
| 2 | Cash flows: contributions and income | [cash-flows.md](cash-flows.md) | Draft |
| 3 | Age: a `birthYear` or `startAge`, so flows can start at an age. Needed for RMDs and Medicare | — | Not started |
| 4 | Specific income types: Social Security claiming age, pension options | — | Not started |
| 5 | Spending categories: essential and discretionary, with optional guardrails that cut discretionary spending in bad years | — | Not started |
| 6 | Accounts and taxes: account types, withdrawal order, RMDs, gross-up for tax | [accounts-taxes.md](accounts-taxes.md) | Draft |
| 7 | Varying returns: `returnRate` as `number[]` for historical backtests and Monte Carlo. The caller generates the sequences and calls `projectPortfolio` once per sequence | — | Not started |
