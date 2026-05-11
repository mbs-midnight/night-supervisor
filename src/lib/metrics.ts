import type { Transaction, TokenType, BalanceSnapshot } from '../types';

const ALL_TOKENS: TokenType[] = ['NIGHT', 'DUST', 'tUSDM', 'tUSDC', 'tEUR'];

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
    } else {
      balance[tx.tokenType] -= amount;
    }
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
};

export function getCurrentBalances(transactions: Transaction[]): CurrentBalances {
  const balance = emptyBalance();
  for (const tx of transactions) {
    if (tx.applyStage !== 'Success') continue;
    const amount = BigInt(tx.amount);
    if (tx.direction === 'incoming') balance[tx.tokenType] += amount;
    else balance[tx.tokenType] -= amount;
  }

  let totalUsd = 0;
  for (const t of ALL_TOKENS) {
    // Convert atomic to decimal (assume 6 decimals for all)
    const decimal = Number(balance[t]) / 1_000_000;
    totalUsd += decimal * USD_RATES[t];
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
    const usdValue = (Number(BigInt(tx.amount)) / 1_000_000) * (USD_RATES[tx.tokenType] ?? 0);

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
