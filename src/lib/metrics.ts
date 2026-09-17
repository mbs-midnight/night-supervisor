import type { Transaction, TokenType, BalanceSnapshot } from '../types';
import { atomicToNumber } from './format';

export const ALL_TOKENS: TokenType[] = ['NIGHT', 'DUST', 'tUSDM', 'tUSDC', 'tEUR', 'sTEST', 'UNKNOWN'];

function emptyBalance(): Record<TokenType, bigint> {
  return ALL_TOKENS.reduce((acc, t) => ({ ...acc, [t]: 0n }), {} as Record<TokenType, bigint>);
}

/**
 * Walks through transactions chronologically and produces balance snapshots
 * at each transaction. Returns an array suitable for time-series charting.
 */
export function deriveBalanceTimeline(transactions: Transaction[]): BalanceSnapshot[] {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const balance = emptyBalance();
  const snapshots: BalanceSnapshot[] = [];

  for (const tx of sorted) {
    if (tx.applyStage !== 'Success') continue;
    const amount = BigInt(tx.amount);
    if (tx.direction === 'incoming') {
      balance[tx.tokenType] += amount;
    } else if (tx.direction === 'outgoing') {
      balance[tx.tokenType] -= amount;
    }
    // 'self' nets to zero for this wallet
    snapshots.push({
      timestamp: tx.timestamp,
      balanceByToken: ALL_TOKENS.reduce(
        (acc, t) => ({ ...acc, [t]: balance[t].toString() }),
        {} as Record<TokenType, string>,
      ),
    });
  }

  return snapshots;
}

export interface CurrentBalances {
  byToken: Record<TokenType, bigint>;
  totalUsdEquivalent: number;
}

// Hardcoded reference rates for the demo. In production, pulled from an
// oracle (Pyth integration would supply these — Pyth partnership work
// covered separately).
const USD_RATES: Record<TokenType, number> = {
  NIGHT: 0.42,    // hypothetical
  DUST: 0.0001,
  tUSDM: 1.00,
  tUSDC: 1.00,
  tEUR: 1.08,
  sTEST: 0,       // test token, no reference rate
  UNKNOWN: 0,
};

/** Token with the largest current balance, for the summary card. */
export function primaryToken(balances: Record<TokenType, bigint>): TokenType {
  let best: TokenType = 'tUSDM';
  let bestValue = -1n;
  for (const t of ALL_TOKENS) {
    if (balances[t] > bestValue) {
      best = t;
      bestValue = balances[t];
    }
  }
  return bestValue > 0n ? best : 'tUSDM';
}

/** Tokens with any successful activity, most active first. */
export function activeTokens(transactions: Transaction[], limit = 3): TokenType[] {
  const counts = new Map<TokenType, number>();
  for (const tx of transactions) {
    if (tx.applyStage !== 'Success') continue;
    counts.set(tx.tokenType, (counts.get(tx.tokenType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

export function getCurrentBalances(transactions: Transaction[]): CurrentBalances {
  const balance = emptyBalance();
  for (const tx of transactions) {
    if (tx.applyStage !== 'Success') continue;
    const amount = BigInt(tx.amount);
    if (tx.direction === 'incoming') balance[tx.tokenType] += amount;
    else if (tx.direction === 'outgoing') balance[tx.tokenType] -= amount;
  }

  let totalUsd = 0;
  for (const t of ALL_TOKENS) {
    totalUsd += atomicToNumber(balance[t], t) * USD_RATES[t];
  }

  return { byToken: balance, totalUsdEquivalent: totalUsd };
}

export interface CounterpartyAggregate {
  address: string;
  txCount: number;
  inboundCount: number;
  outboundCount: number;
  totalInboundUsd: number;
  totalOutboundUsd: number;
  firstSeen: string;
  lastSeen: string;
}

export function aggregateByCounterparty(
  transactions: Transaction[],
  limit = 10,
): CounterpartyAggregate[] {
  const map = new Map<string, CounterpartyAggregate>();

  for (const tx of transactions) {
    if (tx.applyStage !== 'Success') continue;
    const existing = map.get(tx.counterpartyAddress);
    const usdValue = atomicToNumber(tx.amount, tx.tokenType) * (USD_RATES[tx.tokenType] ?? 0);

    if (!existing) {
      map.set(tx.counterpartyAddress, {
        address: tx.counterpartyAddress,
        txCount: 1,
        inboundCount: tx.direction === 'incoming' ? 1 : 0,
        outboundCount: tx.direction === 'outgoing' ? 1 : 0,
        totalInboundUsd: tx.direction === 'incoming' ? usdValue : 0,
        totalOutboundUsd: tx.direction === 'outgoing' ? usdValue : 0,
        firstSeen: tx.timestamp,
        lastSeen: tx.timestamp,
      });
    } else {
      existing.txCount += 1;
      if (tx.direction === 'incoming') {
        existing.inboundCount += 1;
        existing.totalInboundUsd += usdValue;
      } else {
        existing.outboundCount += 1;
        existing.totalOutboundUsd += usdValue;
      }
      if (tx.timestamp < existing.firstSeen) existing.firstSeen = tx.timestamp;
      if (tx.timestamp > existing.lastSeen) existing.lastSeen = tx.timestamp;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.txCount - a.txCount)
    .slice(0, limit);
}
