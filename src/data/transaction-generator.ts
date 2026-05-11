/**
 * Synthetic transaction generator for the Midnight Supervisor reference
 * implementation.
 *
 * Produces transaction streams matching the shape of the production indexer's
 * decrypted output (post-viewing-key trial decryption). Three pattern modes:
 *
 *   1. BASELINE — realistic normal-state activity: incoming salary-like
 *      payments, outgoing payments to varied counterparties, occasional
 *      contract interactions.
 *
 *   2. STRUCTURING — seeds a structuring pattern at a predictable point in
 *      the timeline so the structuring detection rule fires reliably during
 *      demos. Multiple transfers just below a notional reporting threshold
 *      to a small set of counterparties within a tight time window.
 *
 *   3. SANCTIONS — seeds a transaction to/from a known sanctioned address
 *      from the SAMPLE_SANCTIONS_LIST so the screening pipeline fires.
 *
 * In production the indexer produces this stream from real chain data; the
 * generator is used solely for demonstration and reproducible testing.
 */

import type { Transaction, TokenType, Direction, ApplyStage } from '../types';
import { SAMPLE_SANCTIONS_LIST } from './sanctions-list';

// Deterministic RNG so demos are reproducible
class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// Realistic-looking but synthetic counterparty addresses (bech32m shape)
const NORMAL_COUNTERPARTIES = [
  // Looks like a corporate treasury counterparty
  'mn_shield-addr_test1qf3k8m2n5p7r9s1t4u6v8w0y2z4a6b8c0d2e4f6g8h0j2k4m6n8p0r2s4t6u8',
  // Looks like an exchange counterparty
  'mn_shield-addr_test1qa1b3c5d7e9f1g3h5j7k9m1n3p5r7s9t1u3v5w7y9z1a3b5c7d9e1f3g5h7j9',
  // Small-business pattern
  'mn_shield-addr_test1q2w4r6t8y0u2i4o6p8a0s2d4f6g8h0j2k4l6z8x0c2v4b6n8m0q2w4e6r8t0y2',
  'mn_shield-addr_test1q3e5r7t9y1u3i5o7p9a1s3d5f7g9h1j3k5l7z9x1c3v5b7n9m1q3w5e7r9t1y3',
  'mn_shield-addr_test1q4r6t8y0u2i4o6p8a0s2d4f6g8h0j2k4m6n8p0q2s4u6w8y0a2c4e6g8i0k2m4',
  'mn_shield-addr_test1q5t7y9u1i3o5p7a9s1d3f5g7h9j1k3m5n7p9q1s3u5w7y9a1c3e5g7i9k1m3o5',
  // Salary payer pattern
  'mn_shield-addr_test1qpayroll2a4c6e8g0i2k4m6o8q0s2u4w6y8a0c2e4g6i8k0m2o4q6s8u0w2y4a6',
];

// Counterparties used in the structuring pattern (small set, repeated)
const STRUCTURING_COUNTERPARTIES = [
  'mn_shield-addr_test1qstrx1zz2yy4xx6ww8vv0uu2tt4ss6rr8qq0pp2nn4mm6ll8kk0jj2hh4gg6ff8',
  'mn_shield-addr_test1qstrx2zz2yy4xx6ww8vv0uu2tt4ss6rr8qq0pp2nn4mm6ll8kk0jj2hh4gg6ff8',
  'mn_shield-addr_test1qstrx3zz2yy4xx6ww8vv0uu2tt4ss6rr8qq0pp2nn4mm6ll8kk0jj2hh4gg6ff8',
];

const NORMAL_TOKEN_DISTRIBUTION: TokenType[] = [
  'tUSDM', 'tUSDM', 'tUSDM', 'tUSDM',  // 50% stablecoin activity
  'NIGHT', 'NIGHT',                      // 25% NIGHT
  'tUSDC',                                // 12.5%
  'tEUR',                                 // 12.5%
];

// Notional reporting threshold for the structuring rule (e.g. CTR-style)
// $10,000 in tUSDM = 10_000 * 1e6 atomic units (assuming 6 decimals)
export const STRUCTURING_THRESHOLD_ATOMIC = 10_000n * 1_000_000n;

export interface GeneratorConfig {
  startBlock: number;
  startTime: Date;
  baselineTxPerHour: number;
  seed?: number;
}

export interface GeneratorOutput {
  history: Transaction[];          // backfill of past activity
  liveStream: Transaction[];       // what the live subscription will emit
}

function bech32mTxHash(rng: SeededRandom): string {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 64; i++) s += chars[rng.int(0, 15)];
  return s;
}

function bech32mBlockHash(rng: SeededRandom): string {
  return bech32mTxHash(rng);
}

function makeBaselineTransaction(
  rng: SeededRandom,
  blockHeight: number,
  timestamp: Date,
): Transaction {
  const direction: Direction = rng.next() < 0.55 ? 'incoming' : 'outgoing';
  const tokenType = rng.pick(NORMAL_TOKEN_DISTRIBUTION);

  // Realistic amount distributions per token type
  let amount: bigint;
  if (tokenType === 'tUSDM' || tokenType === 'tUSDC') {
    // $50 to $8,500 in stablecoin (atomic units, 6 decimals)
    amount = BigInt(Math.floor(rng.range(50, 8500) * 1_000_000));
  } else if (tokenType === 'tEUR') {
    amount = BigInt(Math.floor(rng.range(40, 7000) * 1_000_000));
  } else if (tokenType === 'NIGHT') {
    // 1 to 500 NIGHT (assume 6 decimals)
    amount = BigInt(Math.floor(rng.range(1, 500) * 1_000_000));
  } else {
    // DUST — small amounts
    amount = BigInt(Math.floor(rng.range(0.01, 5) * 1_000_000));
  }

  const applyStage: ApplyStage = rng.next() < 0.97 ? 'Success' : (rng.next() < 0.5 ? 'PartialSuccess' : 'Failure');

  return {
    hash: bech32mTxHash(rng),
    blockHeight,
    blockHash: bech32mBlockHash(rng),
    timestamp: timestamp.toISOString(),
    applyStage,
    direction,
    tokenType,
    amount: amount.toString(),
    counterpartyAddress: rng.pick(NORMAL_COUNTERPARTIES),
    memo: rng.next() < 0.15 ? generateMemo(rng) : undefined,
  };
}

function generateMemo(rng: SeededRandom): string {
  const memos = [
    'Q2 vendor payment',
    'INV-2026-0432',
    'Consulting retainer',
    'Salary payment',
    'Refund',
    'Settlement #4821',
    'Subscription renewal',
  ];
  return rng.pick(memos);
}

/**
 * Seeds a structuring pattern: 6 transactions to 3 counterparties, each just
 * below the $10,000 threshold, all within a 48-hour window. This is a textbook
 * structuring pattern that any compliance officer would recognize.
 */
function makeStructuringSequence(
  rng: SeededRandom,
  startBlock: number,
  startTime: Date,
): Transaction[] {
  const txs: Transaction[] = [];
  const justBelowThreshold = (): bigint => {
    // Random amount between $9,200 and $9,950 in tUSDM
    const dollarAmount = rng.range(9200, 9950);
    return BigInt(Math.floor(dollarAmount * 1_000_000));
  };

  for (let i = 0; i < 6; i++) {
    const ts = new Date(startTime.getTime() + i * 7 * 60 * 60 * 1000); // ~7 hours apart
    txs.push({
      hash: bech32mTxHash(rng),
      blockHeight: startBlock + i * 60, // ~60 blocks apart
      blockHash: bech32mBlockHash(rng),
      timestamp: ts.toISOString(),
      applyStage: 'Success',
      direction: 'outgoing',
      tokenType: 'tUSDM',
      amount: justBelowThreshold().toString(),
      counterpartyAddress: STRUCTURING_COUNTERPARTIES[i % STRUCTURING_COUNTERPARTIES.length],
      memo: undefined,
    });
  }
  return txs;
}

function makeSanctionedTransaction(
  rng: SeededRandom,
  blockHeight: number,
  timestamp: Date,
): Transaction {
  const sanctioned = rng.pick(SAMPLE_SANCTIONS_LIST);
  return {
    hash: bech32mTxHash(rng),
    blockHeight,
    blockHash: bech32mBlockHash(rng),
    timestamp: timestamp.toISOString(),
    applyStage: 'Success',
    direction: 'incoming',
    tokenType: 'tUSDM',
    amount: (3500n * 1_000_000n).toString(),
    counterpartyAddress: sanctioned.address,
    memo: undefined,
  };
}

/**
 * Generates a 30-day history of baseline activity, with structuring and
 * sanctions patterns seeded at known points so the demo is reproducible.
 */
export function generateHistory(config: GeneratorConfig): GeneratorOutput {
  const rng = new SeededRandom(config.seed ?? 42);
  const history: Transaction[] = [];
  const liveStream: Transaction[] = [];

  const HOURS_OF_HISTORY = 30 * 24;
  let currentBlock = config.startBlock;
  let currentTime = new Date(
    config.startTime.getTime() - HOURS_OF_HISTORY * 60 * 60 * 1000,
  );

  // Historical baseline activity
  for (let h = 0; h < HOURS_OF_HISTORY; h++) {
    const txCount = Math.floor(rng.range(0, config.baselineTxPerHour * 2));
    for (let t = 0; t < txCount; t++) {
      const minutesIntoHour = rng.range(0, 60);
      const txTime = new Date(currentTime.getTime() + minutesIntoHour * 60 * 1000);
      const txBlock = currentBlock + Math.floor(minutesIntoHour / 1.5); // ~1.5 min/block
      history.push(makeBaselineTransaction(rng, txBlock, txTime));
    }
    currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
    currentBlock += 40; // ~40 blocks/hour
  }

  // Seed a structuring pattern 6-8 days before "now"
  const structuringStart = new Date(
    config.startTime.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const structuringStartBlock = config.startBlock - 7 * 24 * 40;
  history.push(...makeStructuringSequence(rng, structuringStartBlock, structuringStart));

  // Seed a sanctioned-counterparty transaction 2 days ago
  const sanctionedTime = new Date(
    config.startTime.getTime() - 2 * 24 * 60 * 60 * 1000,
  );
  history.push(makeSanctionedTransaction(rng, config.startBlock - 2 * 24 * 40, sanctionedTime));

  // Sort history by block height
  history.sort((a, b) => a.blockHeight - b.blockHeight);

  // Live stream: produce transactions for the next several minutes
  // The dashboard subscribes to these and they appear in real-time.
  let liveBlock = config.startBlock;
  let liveTime = config.startTime;
  for (let i = 0; i < 12; i++) {
    liveTime = new Date(liveTime.getTime() + rng.range(15, 45) * 1000);
    liveBlock += rng.int(1, 3);
    liveStream.push(makeBaselineTransaction(rng, liveBlock, liveTime));
  }

  // Insert one more sanctioned hit into the live stream for live demo punch
  const liveSanctionedTime = new Date(liveTime.getTime() + 60 * 1000);
  liveStream.push(makeSanctionedTransaction(rng, liveBlock + 2, liveSanctionedTime));

  return { history, liveStream };
}
