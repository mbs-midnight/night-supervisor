/**
 * Type definitions for the Midnight Supervisor reference implementation.
 *
 * These types deliberately mirror the Midnight Indexer GraphQL schema v1
 * (indexer-api/graphql/schema-v1.graphql in the midnightntwrk/midnight-indexer
 * repository). Any field, naming, or shape you see here corresponds to a real
 * primitive in the production indexer.
 *
 * The MockIndexerClient produces objects of these shapes. A production
 * deployment swaps the mock for a real GraphQL WebSocket subscription against
 * indexer-rs.testnet-02.midnight.network or a custodian-operated indexer
 * instance, with no downstream code changes.
 */

// ============================================================================
// Indexer subscription event types (matches GraphQL `wallet` subscription)
// ============================================================================

export type IndexerEventType = 'ViewingUpdate' | 'ProgressUpdate';

export interface ProgressUpdate {
  __typename: 'ProgressUpdate';
  highestIndex: number;            // latest block indexed (chain-wide)
  highestRelevantIndex: number;    // latest block with any wallet-relevant tx
  highestRelevantWalletIndex: number; // latest block with tx for THIS wallet
}

export interface ViewingUpdate {
  __typename: 'ViewingUpdate';
  index: number;
  update: RelevantTransaction | MerkleTreeCollapsedUpdate;
}

export interface RelevantTransaction {
  __typename: 'RelevantTransaction';
  transaction: Transaction;
}

export interface MerkleTreeCollapsedUpdate {
  __typename: 'MerkleTreeCollapsedUpdate';
  // simplified for this reference implementation
}

export type WalletEvent = ViewingUpdate | ProgressUpdate;

// ============================================================================
// Decrypted transaction payload (post-viewing-key decryption)
// ============================================================================

export type ApplyStage = 'Success' | 'PartialSuccess' | 'Failure';

export type Direction = 'incoming' | 'outgoing';

export type TokenType = 'NIGHT' | 'DUST' | 'tUSDM' | 'tUSDC' | 'tEUR';

export interface Transaction {
  hash: string;                      // chain-visible
  blockHeight: number;               // chain-visible
  blockHash: string;                 // chain-visible
  timestamp: string;                 // ISO-8601
  applyStage: ApplyStage;            // chain-visible

  // Below: only available via successful viewing-key decryption
  direction: Direction;
  tokenType: TokenType;
  amount: bigint | string;           // atomic units; string for JSON-safety
  counterpartyAddress: string;       // counterparty's bech32m wallet address
  memo?: string;                     // optional memo from the ciphertext
  contractAddress?: string;          // if this was a contract interaction
}

// ============================================================================
// Wallet session state
// ============================================================================

export interface WalletSession {
  sessionId: string;
  viewingKeyFingerprint: string;     // first 8 chars of viewing key for display
  walletAddress: string;
  connectedAt: string;
  status: 'connecting' | 'syncing' | 'live' | 'disconnected' | 'error';
  highestIndex: number;
  highestRelevantWalletIndex: number;
}

// ============================================================================
// Compliance overlay types (NOT part of the indexer schema; these are derived
// by the supervisory dashboard from the decrypted stream)
// ============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'sanctions' | 'structuring' | 'velocity' | 'dormancy';

export interface ComplianceAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  description: string;
  triggeredAt: string;               // ISO-8601
  triggeringTransactions: string[];  // transaction hashes
  ruleId: string;                    // identifier of the detection rule
  status: 'open' | 'reviewed' | 'filed' | 'cleared';
}

export interface SanctionedAddressEntry {
  address: string;
  listSource: 'OFAC-SDN' | 'OFSI' | 'EU-CFSL';
  designation: string;
  designatedDate: string;
}

// ============================================================================
// Aggregated metrics for the dashboard
// ============================================================================

export interface BalanceSnapshot {
  timestamp: string;
  balanceByToken: Record<TokenType, string>;
}

export interface DailyMetrics {
  date: string;                      // YYYY-MM-DD
  incomingCount: number;
  outgoingCount: number;
  incomingValue: Record<TokenType, string>;
  outgoingValue: Record<TokenType, string>;
}
