/**
 * Structuring detection.
 *
 * Detects the pattern of multiple transfers, each just below a notional
 * reporting threshold (e.g. the $10,000 CTR threshold under BSA 31 CFR 1010.311
 * or equivalent under MLR / AMLR), aggregating to a substantial amount within
 * a tight time window.
 *
 * Rule parameters (configurable in production):
 *   - THRESHOLD: $10,000 (1e10 atomic units in 6-decimal stablecoin)
 *   - JUST_BELOW_BAND: 80%-99.5% of threshold counts as "just below"
 *   - WINDOW: 72 hours
 *   - MIN_TRANSACTIONS: 3 transactions in the band within the window
 *   - COUNTERPARTY_CONCENTRATION: any subset of related counterparties
 *
 * The rule runs on every new transaction by re-examining the wallet's recent
 * outgoing transactions in tUSDM/tUSDC/tEUR. (Stablecoins only because
 * NIGHT/DUST values are not USD-denominated and the threshold concept doesn't
 * map cleanly. In production this would be enriched with FX conversion.)
 *
 * This is a textbook structuring rule, the kind any BSA officer or AMLD MLRO
 * would expect to see running on a transaction monitoring platform. It is NOT
 * a heuristic novel to shielded-asset monitoring; it is identical to what runs
 * on transparent-chain assets, demonstrating that monitoring obligations on
 * Midnight are mechanically equivalent.
 */

import type { Transaction, ComplianceAlert, TokenType } from '../types';

const THRESHOLD_ATOMIC = 10_000n * 1_000_000n;
const JUST_BELOW_LOWER = (THRESHOLD_ATOMIC * 80n) / 100n;
const JUST_BELOW_UPPER = (THRESHOLD_ATOMIC * 995n) / 1000n;
const WINDOW_MS = 72 * 60 * 60 * 1000;
const MIN_TRANSACTIONS = 3;

const STABLECOIN_TYPES: TokenType[] = ['tUSDM', 'tUSDC', 'tEUR'];

interface StructuringFinding {
  triggeringTxs: Transaction[];
  totalAtomic: bigint;
  uniqueCounterparties: number;
  windowStart: string;
  windowEnd: string;
}

/**
 * Examine the candidate transaction in the context of the wallet's recent
 * outgoing activity. Returns a finding if the structuring pattern is present.
 */
export function detectStructuring(
  candidateTx: Transaction,
  recentHistory: Transaction[],
): StructuringFinding | null {
  if (candidateTx.direction !== 'outgoing') return null;
  if (!STABLECOIN_TYPES.includes(candidateTx.tokenType)) return null;
  if (candidateTx.applyStage !== 'Success') return null;

  const candidateAmount = BigInt(candidateTx.amount);
  if (candidateAmount < JUST_BELOW_LOWER || candidateAmount > JUST_BELOW_UPPER) {
    return null;
  }

  const candidateTime = new Date(candidateTx.timestamp).getTime();
  const windowStart = candidateTime - WINDOW_MS;

  // Find all recent outgoing transactions in the just-below band, in stablecoins,
  // within the window
  const candidates = [
    ...recentHistory,
    candidateTx,
  ].filter((tx) => {
    if (tx.direction !== 'outgoing') return false;
    if (!STABLECOIN_TYPES.includes(tx.tokenType)) return false;
    if (tx.applyStage !== 'Success') return false;
    const amount = BigInt(tx.amount);
    if (amount < JUST_BELOW_LOWER || amount > JUST_BELOW_UPPER) return false;
    const ts = new Date(tx.timestamp).getTime();
    return ts >= windowStart && ts <= candidateTime;
  });

  if (candidates.length < MIN_TRANSACTIONS) return null;

  // Compute aggregate
  const totalAtomic = candidates.reduce(
    (sum, tx) => sum + BigInt(tx.amount),
    0n,
  );
  const uniqueCounterparties = new Set(candidates.map((tx) => tx.counterpartyAddress)).size;

  // Sort by timestamp for window display
  const sorted = [...candidates].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return {
    triggeringTxs: sorted,
    totalAtomic,
    uniqueCounterparties,
    windowStart: sorted[0].timestamp,
    windowEnd: sorted[sorted.length - 1].timestamp,
  };
}

export function structuringFindingToAlert(
  finding: StructuringFinding,
): ComplianceAlert {
  const totalUsd = (Number(finding.totalAtomic) / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const description =
    `${finding.triggeringTxs.length} outgoing stablecoin transfers, each between $8,000 and $9,950, ` +
    `aggregating to $${totalUsd} across ${finding.uniqueCounterparties} counterparties within a ` +
    `${Math.round(WINDOW_MS / (60 * 60 * 1000))}-hour window. Pattern is consistent with structuring ` +
    `to evade the $10,000 currency transaction reporting threshold (BSA 31 CFR 1010.311 / equivalent). ` +
    `Recommend SAR filing and enhanced due diligence on the receiving counterparties.`;

  // Use the FIRST triggering tx to namespace the alert ID. As more transactions
  // in the same structuring window arrive, they trigger the rule again with the
  // same first-tx anchor, so the alert reducer dedupes them. This means one
  // structuring pattern produces one alert that may be enriched as it develops,
  // rather than N alerts as the pattern grows.
  const first = finding.triggeringTxs[0];

  return {
    id: `structuring-${first.hash}`,
    severity: 'warning',
    category: 'structuring',
    title: `Structuring pattern detected — ${finding.triggeringTxs.length} transfers, $${totalUsd} aggregate`,
    description,
    triggeredAt: new Date().toISOString(),
    triggeringTransactions: finding.triggeringTxs.map((tx) => tx.hash),
    ruleId: 'structuring-v1',
    status: 'open',
  };
}
