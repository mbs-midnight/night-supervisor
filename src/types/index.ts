/**
 * Type definitions for the Midnight Supervisor reference implementation.
 *
 * The indexer-facing shapes mirror the Midnight Indexer GraphQL schema v4
 * (indexer-api/graphql/schema-v4.graphql in midnightntwrk/midnight-indexer),
 * which is what indexer.stagenet.shielded.tools serves. Schema v4 replaced the
 * older `wallet(sessionId)` subscription with two streams the live client
 * combines:
 *
 *   - `zswapLedgerEvents(id)` — every serialized zswap ledger Event on the
 *     chain, in order. Replayed locally through ledger-v9's
 *     ZswapLocalState.replayEventsWithChanges, this is how the wallet SDK 2.0
 *     itself syncs, and it yields the wallet's received/spent coins.
 *   - `shieldedTransactions(sessionId)` — the viewing-key session opened by
 *     the `connect` mutation. Used here for the indexer-side relevance scan
 *     progress (ShieldedTransactionsProgress).
 *
 * The MockIndexerClient produces objects of the same downstream shapes. The
 * detection rules, export, and UI consume only these types.
 */

// ============================================================================
// Indexer subscription event types (dashboard-internal envelope)
// ============================================================================

export type IndexerEventType = 'ViewingUpdate' | 'ProgressUpdate';

export interface ProgressUpdate {
  __typename: 'ProgressUpdate';
  /** Chain tip: highest zswap ledger event id (live) or block height (mock). */
  highestIndex: number;
  /** Highest index with any wallet-relevant activity seen by the indexer. */
  highestRelevantIndex: number;
  /** Highest index this wallet has applied. */
  highestRelevantWalletIndex: number;
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

/** Mirrors TransactionResultStatus (SUCCESS / PARTIAL_SUCCESS / FAILURE). */
export type ApplyStage = 'Success' | 'PartialSuccess' | 'Failure';

/**
 * `self` marks a transaction whose spent and received value for a token net
 * to zero for this wallet (consolidation, splitting, change-only). It is
 * common on shielded chains and must not be counted as a transfer.
 */
export type Direction = 'incoming' | 'outgoing' | 'self';

export type TokenType =
  | 'NIGHT'
  | 'DUST'
  | 'tUSDM'
  | 'tUSDC'
  | 'tEUR'
  | 'sTEST'
  | 'UNKNOWN';

/**
 * Counterparty placeholders. A recipient's viewing key decrypts the coins the
 * wallet received and recognizes the coins it spent; it does not reveal who
 * sent or who received. Only self-transfers have a known counterparty.
 */
export const COUNTERPARTY_UNDISCLOSED_SENDER = 'undisclosed-sender';
export const COUNTERPARTY_UNDISCLOSED_RECIPIENT = 'undisclosed-recipient';

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
  counterpartyAddress: string;       // bech32m address, or an undisclosed-* placeholder
  memo?: string;                     // optional memo from the ciphertext
  contractAddress?: string;          // if this was a contract interaction

  // Live-mode extras (absent on synthetic data)
  rawTokenType?: string;             // 32-byte hex RawTokenType from the ledger
  fee?: string;                      // fee paid, in Specks (1 DUST = 10^15 Specks)
  receivedAtomic?: string;           // gross received for this token in this tx
  spentAtomic?: string;              // gross spent for this token in this tx
}

// ============================================================================
// Wallet session state
// ============================================================================

export interface IndexerScanProgress {
  /** highestZswapEndIndex: zswap commitments indexed chain-wide. */
  chainEndIndex: number;
  /** highestCheckedZswapEndIndex: how far the indexer has trial-decrypted for this key. */
  checkedEndIndex: number;
  /** highestRelevantZswapEndIndex: last index the indexer found relevant for this key. */
  relevantEndIndex: number;
}

export interface WalletSession {
  sessionId: string;
  viewingKeyFingerprint: string;     // truncated viewing key for display
  walletAddress: string;
  connectedAt: string;
  status: 'connecting' | 'syncing' | 'live' | 'disconnected' | 'error';
  highestIndex: number;
  highestRelevantWalletIndex: number;
  /** Live mode only: progress of the indexer's own viewing-key relevance scan. */
  indexerScan?: IndexerScanProgress;
  /** Live mode only: number of ledger events replayed locally so far. */
  eventsReplayed?: number;
  /** Live mode only: last error surfaced by the client. */
  lastError?: string;
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
