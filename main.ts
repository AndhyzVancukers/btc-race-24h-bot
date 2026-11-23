// cbBTC trend bot for make.fun "Race a BTC trading bot live for 24 hours".
//
// Strategy (long only, one position, $1,000 paper USDC):
//   - Enter (full cash) when the 120-minute close-to-close return reaches
//     +40 bps: a genuine multi-hour move, not 1-minute noise. Fills land at
//     the next bar's open, so the signal is read off closes only.
//   - Ride it with a wide trailing stop (250 bps from the highest close since
//     entry) so normal pullbacks do not shake the bot out.
//   - Breakeven stop: once the peak runs 60 bps above the entry close, exit
//     if the price falls back to the entry close, so a failed breakout costs
//     only the round-trip fees.
//   - Hard stop: exit if the close falls 150 bps below the entry close.
//   - After any exit, wait 360 bars (6 h) before re-entering, so the bot
//     does not churn in a range.
//   - Safety trade (guardrail): if no trade has happened by bar 1080 (18 h
//     in), enter on a weaker 60-minute signal (+15 bps) with a quarter of the
//     cash, so the entry still records at least one trade on a flat window.
//
// Every decision is integer math on closes (basis points, BigInt division
// truncating toward zero; every threshold compared against is positive, so
// this matches floor division on every comparison the bot makes). A sell the
// harness rejects (max slippage) leaves the position held and the exit
// condition still armed, so it is simply sent again on the next bar. No
// network, no wall clock, no files, no randomness: the same bars always give
// the same orders. Standard library only, plus the vendored kit SDK shim.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Entry: 120-bar return >= 40 bps.
const K = 120;
const TE = 40n;
// Exits (bps from the entry close / the peak close since entry).
const TS = 250n;
const BE = 60n;
const HS = 150n;
// Cooldown after an exit before a new entry.
const CD = 360;
// Safety trade if nothing has traded yet by this bar.
const SAFE_BAR = 1080;
const SAFE_K = 60;
const SAFE_TE = 15n;
const SAFE_DIV = 4n;
// Slippage caps (bps from the latest close the order was decided on).
const BUY_SLIP_BPS = 100;
const SELL_SLIP_BPS = 200;

const closes: bigint[] = [];
let peak: bigint | null = null;
let entryClose: bigint | null = null;
let lastExit = -1e9;
let trades = 0;
let orderNo = 0;
let pendingBuyId: string | null = null;

function buy(state: BarsState, c: bigint, div: bigint): OrderInput[] {
  const notional = state.cash / div;
  if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
  orderNo += 1;
  const cid = `b${orderNo}`;
  peak = c;
  entryClose = c;
  trades += 1;
  pendingBuyId = cid;
  return [{ side: 'buy', client_id: cid, symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: BUY_SLIP_BPS }];
}

function sell(state: BarsState): OrderInput[] {
  const held = state.positions.get(SYMBOL);
  if (held === undefined) return [];
  orderNo += 1;
  return [{ side: 'sell', client_id: `s${orderNo}`, symbol: SYMBOL, qty: held.qty, max_slippage_bps: SELL_SLIP_BPS }];
}

await runBars({
  onBatch(state, batch: Batch): OrderInput[] {
    // A buy the harness rejected (e.g. max slippage) never opened a
    // position: take back the entry state it armed, so the signal can fire
    // again.
    if (pendingBuyId !== null) {
      for (const fill of batch.fills) {
        if (fill.client_id === pendingBuyId) {
          if (fill.status === 'rejected') {
            peak = null;
            entryClose = null;
            trades -= 1;
          }
          break;
        }
      }
      pendingBuyId = null;
    }

    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }

    if (state.warmingUp || closes.length === 0) return [];

    const i = closes.length - 1;
    const c = closes[i];
    const held = state.positions.get(SYMBOL);

    if (held === undefined) {
      if (i - lastExit < CD) return [];
      if (i >= K) {
        const ret = ((c - closes[i - K]) * 10000n) / closes[i - K];
        if (ret >= TE) return buy(state, c, 1n);
      }
      if (trades === 0 && i >= SAFE_BAR && i >= SAFE_K) {
        const ret = ((c - closes[i - SAFE_K]) * 10000n) / closes[i - SAFE_K];
        if (ret >= SAFE_TE) return buy(state, c, SAFE_DIV);
      }
      return [];
    }

    // Holding: maintain the peak and check the exits.
    if (peak === null) {
      peak = c;
      entryClose = c;
    }
    if (c > peak) peak = c;
    const entry = entryClose as bigint;
    if (((entry - c) * 10000n) / entry >= HS) {
      lastExit = i;
      return sell(state);
    }
    if (((peak - c) * 10000n) / peak >= TS) {
      lastExit = i;
      return sell(state);
    }
    const up = ((peak - entry) * 10000n) / entry;
    if (up >= BE && c <= entry) {
      lastExit = i;
      return sell(state);
    }
    return [];
  },
});
