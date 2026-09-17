/**
 * IndexerClient interface — the swap boundary between mock and live data.
 *
 * Two implementations exist:
 *
 *   - MockIndexerClient (src/data/mock-indexer-client.ts): deterministic
 *     synthetic stream. Chosen from the entry screen ("Run synthetic demo").
 *   - GraphqlIndexerClient (src/data/GraphqlIndexerClient.ts): live client for
 *     an indexer serving GraphQL schema v4 (Stagenet). Registers the viewing
 *     key with the `connect` mutation, replays `zswapLedgerEvents` through
 *     ledger-v9 to decrypt the wallet's coin movements, and enriches each hit
 *     with block metadata from `transactions(offset: {hash})`.
 *
 * Both emit the same `ViewingUpdate` / `ProgressUpdate` envelopes. The
 * detection rules, screening, export, and UI consume only this interface.
 */

import type { WalletEvent, WalletSession } from '../types';

export type WalletEventHandler = (event: WalletEvent) => void;
export type SessionStateHandler = (session: WalletSession) => void;

export interface IndexerClient {
  /**
   * Establish a session by registering a viewing key with the indexer.
   * The live client calls the `connect(viewingKey: ViewingKey!)` GraphQL
   * mutation and opens the WebSocket subscriptions. Returns the session metadata.
   */
  connect(viewingKey: string, walletAddress: string): Promise<WalletSession>;

  /**
   * Subscribe to wallet events. Calls the handler for every ViewingUpdate
   * (containing relevant transactions) and ProgressUpdate (sync progress).
   * The live client drives these from the `zswapLedgerEvents` and
   * `shieldedTransactions` GraphQL subscriptions.
   */
  subscribe(handler: WalletEventHandler): () => void;

  /**
   * Subscribe to session state changes (connecting -> syncing -> live).
   */
  onSessionUpdate(handler: SessionStateHandler): () => void;

  /**
   * End the session. The live client closes the socket and calls the
   * `disconnect(sessionId: HexEncoded!)` GraphQL mutation.
   */
  disconnect(): Promise<void>;
}
