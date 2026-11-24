# Stage 6: Accounts and Taxes

**Status:** Draft. An outline to record the ideas so far; the decisions at the
end are open. Depends on stage 2 ([cash-flows.md](cash-flows.md)) and stage 3
(age).

Replaces the single portfolio balance with several **accounts** (traditional
IRA or 401k, Roth, taxable brokerage), and adds the rules that make them
different: withdrawal order, RMDs and taxes.

## Problem

A real portfolio is a set of accounts with different tax rules. The same
$40,000 of spending costs different amounts depending on where it comes from:
a traditional IRA withdrawal is taxed as income, a Roth withdrawal isn't, and
a taxable account is taxed only on its gains. Traditional accounts also force
withdrawals (RMDs) from a certain age.

Accounts and taxes are one stage because, **without taxes, multiple accounts
barely change the result**. A dollar from an IRA and a dollar from a Roth would
be the same, and the only difference would come from different return rates,
which would make withdrawal order matter for the wrong reason.

## Accounts and asset classes are different

- **Account type** (traditional, Roth, taxable) sets the **tax rules**.
- **Asset class** (stocks, bonds, cash) sets the **expected return and risk**.

An IRA can hold bonds, and a brokerage account can hold stocks. This stage
models accounts, each with a single blended return rate standing in for
whatever it holds. Allocation inside an account is out of scope (see below).

## Design outline

### Input

Following [architecture.md](architecture.md#1-input-grouped-by-topic), this
stage changes the `portfolio` group and adds a `tax` group:

```ts
interface Account {
  id: string;                                  // unique
  type: "traditional" | "roth" | "taxable";
  balance: number;                             // starting balance, >= 0
  returnRate: number;                          // blended expected return; see Decision 4
}

interface ProjectionInput {
  timeline:    { startYear: number; years: number };
  assumptions: { inflationRate: number };     // returnRate moves to each account (Decision 4)
  portfolio:   { accounts: Account[] };       // replaces startBalance; total = sum of balances
  spending:    { annual: number };
  flows?:      CashFlow[];
  household:   { birthYear: number };         // from stage 3; needed for RMDs
  tax:         { /* to be designed; see Decision 2 */ };
}

interface Contribution extends FlowBase {
  type: "contribution";
  account: string;       // id of the receiving account; see Decision 3
  indexing?: Indexing;
}
```

Topic folders: `topics/accounts/` (accounts, withdrawal order) and
`topics/tax/` (taxes, RMDs), per
[architecture.md](architecture.md#topic-modules).

### What goes in the schedule and what goes in `simulate`

Following the rule in
[architecture.md](architecture.md#2-the-schedule-everything-known-in-advance):
anything known in advance goes in `buildSchedule`; anything that depends on
the portfolio goes in `simulate`.

| Known in advance (schedule builders) | Depends on the portfolio (`simulate`) |
|---|---|
| Contributions to each account per year | Each account's balance |
| Each account's return rate per year (constant here; return sequences in stage 7) | Which accounts each withdrawal comes from |
| RMD percentage per year, from age and the IRS table | RMD amount: the percentage × last year-end traditional balance |
| Spending and income | Taxes on the withdrawals and income |

The RMD row shows the split: the schedule holds the **percentage**, and
`simulate` applies it to the **balance**. New builders: `returnRatesFor`,
`rmdPercentFor`; `flowsFor` gains contributions per account.

### Simulation

`SimState.accounts`, introduced with a single account in stage 2, now holds
every account. This stage adds one year step and extends two others, in the
order set in
[architecture.md](architecture.md#3-simulation-year-steps-in-a-fixed-order):

| Order | Step | Change in this stage |
|---|---|---|
| 1 | `depositContributions` | Deposits into each contribution's `account` |
| 2 | `takeRmds` | **New.** `s.rmdPercent` × last year-end balance of each traditional account. Before step 3, because RMDs count toward spending |
| 3 | `withdrawForSpending` | `need = spending + taxes - income - RMDs`. Withdraws across accounts in the chosen order (Decision 1), grossed up so that spending is still covered after tax |
| 4 | `reinvest` | Also reinvests RMDs above what was needed, into the taxable account |
| 5 | `grow` | Each account at its own rate (`s.returnRates[id]`) |

Still to work out in this stage: how the tax gross-up interacts with
withdrawal order (the tax depends on which account the money comes from,
and the amount withdrawn depends on the tax).

### Equations

Both yearly equations in
[architecture.md](architecture.md#4-two-equations-every-year) gain terms:

```
income + withdrawals + shortfall = spending + taxes + reinvested
endBalance = startBalance + contributions + reinvested - withdrawals + growth
```

- `withdrawals` now includes RMDs and the tax gross-up.
- `taxes` is no longer 0.
- `reinvested` includes RMDs above what was needed.
- The portfolio equation holds for each account and for the total.

`spending` keeps its meaning (what is spent on living), and `shortfall` is
still only unfunded spending.

### Output

- Each row gains per-account balances and withdrawals, keyed by account id.
  This is the point to group row fields (`row.balances`, `row.cash`), per
  [architecture.md](architecture.md#5-output).
- `startBalance`, `endBalance` and `endBalanceReal` stay, as totals across
  accounts.
- New: taxes paid per year and in total, and RMDs per year.

## Out of scope

- **Asset allocation inside an account** (e.g. 60% stocks, 40% bonds) and
  rebalancing. A lot of complexity for little extra accuracy with constant
  returns. Revisit with stage 7 (varying returns), where allocation affects
  risk.
- **Roth conversions.** A likely later stage once taxes exist.
- **Account types beyond the three** (HSA, 529, annuities).

## Decisions

Open.

1. **Default withdrawal order.** Taxable, then traditional, then Roth (the
   common default, so tax-free growth lasts longest), or proportional across
   accounts? Should the caller be able to set the order?
2. **How taxes are modelled.** A single effective tax rate first, or federal
   brackets from the start? Brackets change every year and differ by filing
   status. State taxes?
3. **Contributions with no `account`.** Required once there are several
   accounts, or default to the first account?
4. **Return rate per account or for the whole portfolio.** Per account is more
   flexible; a single portfolio rate with all accounts growing alike is
   simpler and avoids return differences distorting withdrawal order.
5. **Taxable accounts.** Tax only the gains, which needs cost-basis tracking,
   or treat a fixed share of each withdrawal as gains?
6. **RMD rules.** The starting age depends on birth year, so this needs stage 3
   (age). How much of the IRS rules to model (inherited accounts, still
   working)?

## Changes to reference docs

To be listed once the design is settled. Expected: `portfolio.startBalance`
and `assumptions.returnRate` replaced by `portfolio.accounts` in
**projection.md** (breaking changes), new `tax` group and account and
contribution rules in **validation.md**, the new modules and steps in
**architecture.md**, and the stage status in **README.md**.
