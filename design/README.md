# Design Docs

## How these docs work

There are three kinds of doc:

- **Reference docs** (this folder) describe how the library works now, and
  always match the code. Reading one never requires replaying history.
- **Drafts** (`drafts/`) propose one stage of development: the problem, the
  design, the open decisions, and the changes it will make to the reference
  docs. Each follows the checklist in
  [architecture.md](architecture.md#adding-a-stage-checklist), and can be as
  long as the design needs.
- **[decisions.md](decisions.md)** keeps the record of why for each
  implemented stage, condensed: the problem, the decisions with the options
  rejected, and breaking changes.

When a stage is implemented, its design is merged into the reference docs,
the draft is condensed into `decisions.md`, and the draft is deleted. Git
keeps the full draft; each entry names its commit. This way the design is
said in one place, and nothing finished sits beside the code drifting from
it.

A draft has a status line:

| Status | Meaning |
|---|---|
| Draft | Under discussion; decisions open |
| Approved | Design agreed; not yet built |

Reference docs change only once a design is approved.

## Reference docs

| Doc | Covers | Status |
|---|---|---|
| [projection.md](projection.md) | Core engine: inputs, outputs, the yearly algorithm | Implemented |
| [validation.md](validation.md) | Guard checks on input, and the limits exported for clients | Implemented |
| [architecture.md](architecture.md) | Engine structure: input groups, schedule builders, year steps, the two yearly equations, and the checklist for adding a stage | Implemented (introduced by stage 2) |
| [decisions.md](decisions.md) | Why each implemented stage is the way it is | — |

## Roadmap

The library is pre-1.0 with no outside callers, so a stage may change the API
when that gives a better design. Breaking changes are listed in
[decisions.md](decisions.md) and in the reference doc they affect.

| # | Stage | Doc | Status |
|---|---|---|---|
| 0 | Core projection: compounding, inflation, withdrawals, real vs nominal | [projection.md](projection.md) | Implemented |
| 1 | Input validation | [validation.md](validation.md) | Implemented |
| 2 | Cash flows: contributions and income | [projection.md](projection.md), [decisions.md](decisions.md#stage-2-cash-flows) | Implemented |
| 3 | Household and age: one or two people with birth years, so flows can start or stop at an age. Needed for RMDs and Medicare | [projection.md](projection.md#household-and-age), [decisions.md](decisions.md#stage-3-household-and-age) | Implemented |
| 4 | Specific income types: Social Security claiming age, pension options | — | Not started |
| 5 | Spending categories: essential and discretionary, with optional guardrails that cut discretionary spending in bad years | — | Not started |
| 6 | Accounts and taxes: account types, withdrawal order, RMDs, gross-up for tax | [drafts/accounts-taxes.md](drafts/accounts-taxes.md) | Draft |
| 7 | Varying returns: `returnRate` as `number[]` for historical backtests and Monte Carlo. The caller generates the sequences and calls `projectPortfolio` once per sequence | — | Not started |
