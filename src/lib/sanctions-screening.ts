/**
 * Sanctions screening.
 *
 * Real-time O(1) lookup against the consolidated sanctions list. Fires a
 * critical-severity alert on any match.
 *
 * In production:
 *   - Refresh the SAMPLE_SANCTIONS_LIST from authoritative feeds daily.
 *   - Add fuzzy matching for known address-derivation patterns (e.g. CashFlow
 *     2nd-degree heuristics).
 *   - Integrate with the custodial KYC layer for entity-level attribution
 *     where available (a wallet address with no KYC linkage and a sanctions
 *     hit is a higher-severity finding than one with linkage).
 */

import type { Transaction, ComplianceAlert } from '../types';
import { SANCTIONS_LOOKUP } from '../data/sanctions-list';

export function screenTransactionForSanctions(
  tx: Transaction,
): ComplianceAlert | null {
  const hit = SANCTIONS_LOOKUP.get(tx.counterpartyAddress);
  if (!hit) return null;

  const directionWord =
    tx.direction === 'incoming' ? 'received from' : tx.direction === 'outgoing' ? 'sent to' : 'moved within';

  return {
    id: `sanctions-${tx.hash}`,
    severity: 'critical',
    category: 'sanctions',
    title: `Sanctioned counterparty — ${hit.listSource}`,
    description: `Transaction ${tx.hash.slice(0, 10)}… ${directionWord} address designated under ${hit.designation}. Listed ${hit.designatedDate}. Immediate review required; transaction may require blocking and SAR filing per BSA / MLR / AMLR obligations.`,
    triggeredAt: new Date().toISOString(),
    triggeringTransactions: [tx.hash],
    ruleId: 'sanctions-v1',
    status: 'open',
  };
}
