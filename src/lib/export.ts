/**
 * Audit trail export.
 *
 * Produces a CSV export of decrypted transaction history suitable for:
 *   - 5-7 year recordkeeping retention (BSA 31 CFR 1010.430, MLR Reg 40,
 *     AMLR equivalent)
 *   - SAR/CTR filing supporting documentation
 *   - Tax reporting reconciliation (1099-DA, CARF, DAC8)
 *   - Internal audit and external examiner review
 *
 * Format: RFC 4180 CSV with header row. UTF-8. Atomic units preserved as
 * decimal strings (not converted to floating-point) to avoid rounding errors
 * on large balances. Token-specific decimal conventions are documented in the
 * format header comment.
 */

import type { Transaction, ComplianceAlert } from '../types';

function csvEscape(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const ATOMIC_DECIMALS: Record<string, number> = {
  NIGHT: 6,
  DUST: 6,
  tUSDM: 6,
  tUSDC: 6,
  tEUR: 6,
  sTEST: 0,
  UNKNOWN: 0,
};

function atomicToDecimal(amount: string, tokenType: string): string {
  const decimals = ATOMIC_DECIMALS[tokenType] ?? 6;
  const amt = BigInt(amount);
  const divisor = 10n ** BigInt(decimals);
  const whole = amt / divisor;
  const frac = amt % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}

export function exportTransactionsAsCsv(
  transactions: Transaction[],
  walletAddress: string,
  exportRange: { from: string; to: string },
): string {
  const headers = [
    'transaction_hash',
    'block_height',
    'block_hash',
    'timestamp_iso8601',
    'apply_stage',
    'direction',
    'token_type',
    'amount_atomic',
    'amount_decimal',
    'counterparty_address',
    'memo',
    'contract_address',
    'raw_token_type',
    'received_atomic',
    'spent_atomic',
    'fee_specks',
  ];

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const headerRows = [
    `# Midnight Supervisor — Decrypted Shielded Transaction Export`,
    `# Wallet: ${walletAddress}`,
    `# Export range: ${exportRange.from} to ${exportRange.to}`,
    `# Export generated: ${new Date().toISOString()}`,
    `# Decimal convention: NIGHT, DUST, tUSDM, tUSDC, tEUR use 6-decimal atomic units; sTEST is integer units`,
    `# Direction: incoming / outgoing are net transfers; self nets to zero for this wallet (received_atomic and spent_atomic give gross legs)`,
    `# Source: Midnight Indexer GraphQL schema v4 zswapLedgerEvents, replayed through ledger-v9 with the wallet's keys`,
    `# `,
  ].join('\n');

  const csvBody = [
    headers.join(','),
    ...sorted.map((tx) =>
      [
        csvEscape(tx.hash),
        csvEscape(tx.blockHeight),
        csvEscape(tx.blockHash),
        csvEscape(tx.timestamp),
        csvEscape(tx.applyStage),
        csvEscape(tx.direction),
        csvEscape(tx.tokenType),
        csvEscape(String(tx.amount)),
        csvEscape(atomicToDecimal(String(tx.amount), tx.tokenType)),
        csvEscape(tx.counterpartyAddress),
        csvEscape(tx.memo ?? ''),
        csvEscape(tx.contractAddress ?? ''),
        csvEscape(tx.rawTokenType ?? ''),
        csvEscape(tx.receivedAtomic ?? ''),
        csvEscape(tx.spentAtomic ?? ''),
        csvEscape(tx.fee ?? ''),
      ].join(','),
    ),
  ].join('\n');

  return `${headerRows}\n${csvBody}\n`;
}

export function exportAlertsAsCsv(
  alerts: ComplianceAlert[],
  walletAddress: string,
): string {
  const headers = [
    'alert_id',
    'triggered_at',
    'severity',
    'category',
    'rule_id',
    'status',
    'title',
    'description',
    'triggering_transaction_hashes',
  ];

  const headerRows = [
    `# Midnight Supervisor — Compliance Alert Export`,
    `# Wallet: ${walletAddress}`,
    `# Export generated: ${new Date().toISOString()}`,
    `# `,
  ].join('\n');

  const csvBody = [
    headers.join(','),
    ...alerts.map((a) =>
      [
        csvEscape(a.id),
        csvEscape(a.triggeredAt),
        csvEscape(a.severity),
        csvEscape(a.category),
        csvEscape(a.ruleId),
        csvEscape(a.status),
        csvEscape(a.title),
        csvEscape(a.description),
        csvEscape(a.triggeringTransactions.join('; ')),
      ].join(','),
    ),
  ].join('\n');

  return `${headerRows}\n${csvBody}\n`;
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
