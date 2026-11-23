[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/AndhyzVancukers/btc-race-24h-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/AndhyzVancukers/btc-race-24h-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# cbBTC trend bot — make.fun "Race a BTC trading bot live for 24 hours"

Entry for the make.fun bounty [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261123-0511).

A deterministic, long-only trading bot for Coinbase Wrapped BTC (cbBTC) on
1-minute bars, written for the `agent-fun/bars-replay/v1` protocol. It starts
with $1,000 of paper USDC and trades one position at a time.

## Strategy

- **Enter** (full cash) when the 120-minute close-to-close return reaches
  +40 bps: a genuine multi-hour move, not 1-minute noise. Orders decided on a
  bar fill at the next bar's open, so signals are read off closes only.
- **Ride** the move with a wide trailing stop (250 bps below the highest close
  since entry), so ordinary pullbacks do not shake the bot out.
- **Breakeven stop**: once the peak runs 60 bps above the entry close, exit
  if the price falls back to the entry close — a failed breakout then costs
  only the round-trip fees.
- **Hard stop**: exit if the close falls 150 bps below the entry close.
- **Cooldown**: after any exit, wait 360 bars (6 h) before re-entering, so the
  bot does not churn in a range.
- **Safety trade**: if no trade has happened by bar 1080 (18 h in), enter on
  a weaker 60-minute signal (+15 bps) with a quarter of the cash, so the entry
  still records at least one trade on a flat window.

Every decision is integer math on closes (basis points). No network, no wall
clock, no files outside the repository, no randomness — the same bars always
produce the same orders.

## Files

- `main.ts` — the bot (Node 22, TypeScript with erasable syntax, standard
  library only).
- `vendor/makefun-bars.ts` — a byte-for-byte copy of the kit's TypeScript SDK
  shim.
- `LICENSE` — MIT.

## Local grade (dev window)

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

Dev-window result: **net PnL +$30.98** (1 trade, max drawdown 1.98%, fees
$0.81) on the frozen 24-hour dev window — comfortably above the $0 gate.
The same strategy loses only $3.40 on the time-reversed dev window, and
stays inside a $41 worst case across 80 block-bootstrapped 24-hour windows.
